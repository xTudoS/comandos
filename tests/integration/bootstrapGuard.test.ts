import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { deviceApprovals, verifications, auditLog } from '~~/server/db/schema'
import { evaluateBootstrapGuard } from '~~/server/utils/bootstrapGuard'
import { useTestDb, seedUser, addPasskey, seedSignInOtp, seedApproval } from './helpers'

const baseInput = {
  fingerprint: 'fp-abc',
  userAgent: 'vitest/1.0',
  ip: '203.0.113.7',
  storeMode: 'plain' as const,
}

describe('evaluateBootstrapGuard', () => {
  it('returns proceed when user has no passkey and OTP is valid (OTP not consumed by the guard)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'fresh@example.com' })
      await seedSignInOtp(db, { email: 'fresh@example.com', code: '123456' })

      const decision = await evaluateBootstrapGuard(db, {
        ...baseInput,
        email: 'fresh@example.com',
        otp: '123456',
      })

      expect(decision).toEqual({ kind: 'proceed', userId })
      const leftovers = await db
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, 'sign-in-otp-fresh@example.com'))
      expect(leftovers).toHaveLength(1)
    } finally {
      await pool.end()
    }
  })

  it('throws ERR_BAD_REQUEST when OTP is wrong, without leaking passkey presence', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'returning@example.com' })
      await addPasskey(db, { userId })
      await seedSignInOtp(db, { email: 'returning@example.com', code: '123456' })

      await expect(
        evaluateBootstrapGuard(db, {
          ...baseInput,
          email: 'returning@example.com',
          otp: '999999',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_BAD_REQUEST' } },
      })

      const approvals = await db.select().from(deviceApprovals).where(eq(deviceApprovals.userId, userId))
      expect(approvals).toHaveLength(0)
    } finally {
      await pool.end()
    }
  })

  it('throws ERR_BAD_REQUEST when account does not exist (uniform error shape, no enumeration)', async () => {
    const { db, pool } = await useTestDb()
    try {
      await expect(
        evaluateBootstrapGuard(db, {
          ...baseInput,
          email: 'nobody@example.com',
          otp: '123456',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_BAD_REQUEST' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('blocks with approval-required, consumes the OTP, and creates a device_approval row when user has a passkey', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'returning@example.com' })
      await addPasskey(db, { userId })
      await seedSignInOtp(db, { email: 'returning@example.com', code: '654321' })

      const decision = await evaluateBootstrapGuard(db, {
        ...baseInput,
        email: 'returning@example.com',
        otp: '654321',
      })

      expect(decision.kind).toBe('approval-required')
      if (decision.kind !== 'approval-required') throw new Error('unreachable')
      expect(decision.approvalId).toMatch(/^[0-9a-f-]{36}$/)

      const remaining = await db
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, 'sign-in-otp-returning@example.com'))
      expect(remaining).toHaveLength(0)

      const approvals = await db
        .select()
        .from(deviceApprovals)
        .where(eq(deviceApprovals.id, decision.approvalId))
      expect(approvals).toHaveLength(1)
      expect(approvals[0]).toMatchObject({
        userId,
        requestFingerprint: 'fp-abc',
        requestUserAgent: 'vitest/1.0',
        requestIp: '203.0.113.7',
        status: 'pending',
      })
      expect(approvals[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now())
    } finally {
      await pool.end()
    }
  })

  it('bypasses the passkey block when an approved approval exists for (user, fingerprint), consuming the approval', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'returning@example.com' })
      await addPasskey(db, { userId })
      await seedSignInOtp(db, { email: 'returning@example.com', code: '123456' })
      const approvalId = await seedApproval(db, {
        userId,
        requestFingerprint: 'fp-abc',
        status: 'approved',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      })

      const decision = await evaluateBootstrapGuard(db, {
        ...baseInput,
        email: 'returning@example.com',
        otp: '123456',
      })

      expect(decision).toEqual({ kind: 'proceed', userId })

      // Approval has been consumed.
      const [approval] = await db
        .select({ status: deviceApprovals.status })
        .from(deviceApprovals)
        .where(eq(deviceApprovals.id, approvalId))
      expect(approval!.status).toBe('expired')

      // OTP was left in place on the proceed branch (better-auth consumes it
      // itself when the caller invokes signInEmailOTP next).
      const leftovers = await db
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, 'sign-in-otp-returning@example.com'))
      expect(leftovers).toHaveLength(1)

      // The claim was audited.
      const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, approvalId))
      expect(audits).toHaveLength(1)
      expect(audits[0]!.action).toBe('update')
      expect((audits[0]!.context as Record<string, unknown>).reason).toBe('otp_bootstrap_claim')
    } finally {
      await pool.end()
    }
  })

  it('does not bypass when the approval is for a different fingerprint', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'returning@example.com' })
      await addPasskey(db, { userId })
      await seedSignInOtp(db, { email: 'returning@example.com', code: '654321' })
      await seedApproval(db, {
        userId,
        requestFingerprint: 'fp-other-device',
        status: 'approved',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      })

      const decision = await evaluateBootstrapGuard(db, {
        ...baseInput,
        email: 'returning@example.com',
        otp: '654321',
      })

      expect(decision.kind).toBe('approval-required')
    } finally {
      await pool.end()
    }
  })

  it('does not bypass when the approval has already expired', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'returning@example.com' })
      await addPasskey(db, { userId })
      await seedSignInOtp(db, { email: 'returning@example.com', code: '654321' })
      await seedApproval(db, {
        userId,
        requestFingerprint: 'fp-abc',
        status: 'approved',
        expiresAt: new Date(Date.now() - 1000),
      })

      const decision = await evaluateBootstrapGuard(db, {
        ...baseInput,
        email: 'returning@example.com',
        otp: '654321',
      })

      expect(decision.kind).toBe('approval-required')
    } finally {
      await pool.end()
    }
  })

  it('rejects expired OTP rows', async () => {
    const { db, pool } = await useTestDb()
    try {
      await seedUser(db, { email: 'fresh@example.com' })
      await seedSignInOtp(db, {
        email: 'fresh@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() - 60_000),
      })

      await expect(
        evaluateBootstrapGuard(db, {
          ...baseInput,
          email: 'fresh@example.com',
          otp: '123456',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_BAD_REQUEST' } },
      })
    } finally {
      await pool.end()
    }
  })
})

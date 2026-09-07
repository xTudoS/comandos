import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { deviceApprovals } from '~~/server/db/schema'
import { buildApprovalChallenge } from '~~/server/utils/approvalChallenge'
import { useTestDb, seedUser, addPasskey } from './helpers'

async function seedPendingApproval(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: {
    userId: string
    expiresAt?: Date
    status?: 'pending' | 'approved' | 'rejected' | 'expired'
  },
) {
  const [row] = await db
    .insert(deviceApprovals)
    .values({
      userId: args.userId,
      requestFingerprint: 'fp-req',
      requestUserAgent: 'some-ua',
      requestIp: '203.0.113.9',
      status: args.status ?? 'pending',
      expiresAt: args.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000),
    })
    .returning()
  return row!.id
}

describe('buildApprovalChallenge', () => {
  it('returns a challenge + decision payload + allowCredentials for a valid pending approval', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      await addPasskey(db, { userId })
      const approvalId = await seedPendingApproval(db, { userId })

      const result = await buildApprovalChallenge(db, {
        approvalId,
        decidingUserId: userId,
        decision: 'approve',
      })

      expect(result.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(result.decisionPayload.approval_id).toBe(approvalId)
      expect(result.decisionPayload.decision).toBe('approve')
      expect(result.decisionPayload.target_user_id).toBe(userId)
      expect(result.decisionPayload.requester_fingerprint).toBe('fp-req')
      expect(result.decisionPayload.requester_ua).toBe('some-ua')
      expect(result.decisionPayload.requester_ip).toBe('203.0.113.9')
      expect(result.allowCredentials).toHaveLength(1)
      expect(result.allowCredentials[0]!.type).toBe('public-key')
      expect(result.userVerification).toBe('required')
    } finally {
      await pool.end()
    }
  })

  it('throws NOT_FOUND when the approval does not exist', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      await addPasskey(db, { userId })

      await expect(
        buildApprovalChallenge(db, {
          approvalId: '00000000-0000-0000-0000-000000000000',
          decidingUserId: userId,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        data: { error: { code: 'ERR_NOT_FOUND' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('throws FORBIDDEN when the approval belongs to a different user', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      await addPasskey(db, { userId: bob })
      const approvalId = await seedPendingApproval(db, { userId: alice })

      await expect(
        buildApprovalChallenge(db, {
          approvalId,
          decidingUserId: bob,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        data: { error: { code: 'ERR_FORBIDDEN' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('throws BAD_REQUEST when the approval is already decided', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      await addPasskey(db, { userId })
      const approvalId = await seedPendingApproval(db, { userId })
      await db
        .update(deviceApprovals)
        .set({ status: 'approved' })
        .where(eq(deviceApprovals.id, approvalId))

      await expect(
        buildApprovalChallenge(db, {
          approvalId,
          decidingUserId: userId,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_BAD_REQUEST' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('throws APPROVAL_EXPIRED when expires_at is in the past and flips status to expired', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      await addPasskey(db, { userId })
      const approvalId = await seedPendingApproval(db, {
        userId,
        expiresAt: new Date(Date.now() - 1000),
      })

      await expect(
        buildApprovalChallenge(db, {
          approvalId,
          decidingUserId: userId,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({
        statusCode: 410,
        data: { error: { code: 'ERR_APPROVAL_EXPIRED' } },
      })

      const [row] = await db
        .select({ status: deviceApprovals.status })
        .from(deviceApprovals)
        .where(eq(deviceApprovals.id, approvalId))
      expect(row!.status).toBe('expired')
    } finally {
      await pool.end()
    }
  })

  it('trims and filters empty segments from stored transports', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const approvalId = await seedPendingApproval(db, { userId })
      await db.insert((await import('~~/server/db/schema')).passkeys).values({
        userId,
        credentialId: 'cred-trim-test',
        publicKey: 'pk',
        transports: 'usb, nfc,, ble',
      })

      const result = await buildApprovalChallenge(db, {
        approvalId,
        decidingUserId: userId,
        decision: 'approve',
      })

      const withTransports = result.allowCredentials.find((c) => c.id === 'cred-trim-test')
      expect(withTransports!.transports).toEqual(['usb', 'nfc', 'ble'])
    } finally {
      await pool.end()
    }
  })

  it('throws BAD_REQUEST when the deciding user has no passkeys', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const approvalId = await seedPendingApproval(db, { userId })

      await expect(
        buildApprovalChallenge(db, {
          approvalId,
          decidingUserId: userId,
          decision: 'approve',
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

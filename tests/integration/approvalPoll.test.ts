import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { deviceApprovals } from '~~/server/db/schema'
import { pollApproval } from '~~/server/utils/approvalPoll'
import { useTestDb, seedUser, seedApproval } from './helpers'

describe('pollApproval', () => {
  it('returns pending for a pending approval when fingerprint matches', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'u@example.com' })
      const approvalId = await seedApproval(db, { userId, requestFingerprint: 'fp-abc' })

      const result = await pollApproval(db, { approvalId, fingerprint: 'fp-abc' })
      expect(result).toEqual({ status: 'pending' })
    } finally {
      await pool.end()
    }
  })

  it('returns 404 (uniform) when fingerprint is missing', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'u@example.com' })
      const approvalId = await seedApproval(db, { userId })

      await expect(pollApproval(db, { approvalId, fingerprint: null })).rejects.toMatchObject({
        statusCode: 404,
        data: { error: { code: 'ERR_NOT_FOUND' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('returns 404 when fingerprint does not match the approval requester', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'u@example.com' })
      const approvalId = await seedApproval(db, { userId, requestFingerprint: 'fp-real' })

      await expect(
        pollApproval(db, { approvalId, fingerprint: 'fp-attacker' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        data: { error: { code: 'ERR_NOT_FOUND' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('returns 404 when the approval does not exist', async () => {
    const { db, pool } = await useTestDb()
    try {
      await expect(
        pollApproval(db, {
          approvalId: '00000000-0000-0000-0000-000000000000',
          fingerprint: 'fp-abc',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        data: { error: { code: 'ERR_NOT_FOUND' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('returns approved (status only — no session token surfaced)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'u@example.com' })
      const approvalId = await seedApproval(db, {
        userId,
        requestFingerprint: 'fp-abc',
        status: 'approved',
      })

      const result = await pollApproval(db, { approvalId, fingerprint: 'fp-abc' })
      expect(result).toEqual({ status: 'approved' })
    } finally {
      await pool.end()
    }
  })

  it('flips pending-but-past-deadline rows to expired', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'u@example.com' })
      const approvalId = await seedApproval(db, {
        userId,
        requestFingerprint: 'fp-abc',
        expiresAt: new Date(Date.now() - 1000),
      })

      const result = await pollApproval(db, { approvalId, fingerprint: 'fp-abc' })
      expect(result).toEqual({ status: 'expired' })

      const [row] = await db.select().from(deviceApprovals).where(eq(deviceApprovals.id, approvalId))
      expect(row!.status).toBe('expired')
    } finally {
      await pool.end()
    }
  })

  it('returns rejected for rejected approvals', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'u@example.com' })
      const approvalId = await seedApproval(db, {
        userId,
        requestFingerprint: 'fp-abc',
        status: 'rejected',
      })
      const result = await pollApproval(db, { approvalId, fingerprint: 'fp-abc' })
      expect(result).toEqual({ status: 'rejected' })
    } finally {
      await pool.end()
    }
  })
})

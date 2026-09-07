import { describe, it, expect } from 'vitest'
import { desc, eq } from 'drizzle-orm'
import { deviceApprovals } from '~~/server/db/schema'
import { useTestDb, seedUser, seedApproval } from './helpers'

// Covers the core query behind /api/auth/device-approvals/history.get —
// endpoint is a thin session-guard wrapper around this select.
describe('approvals history query', () => {
  it('returns all statuses for the authed user ordered by requestedAt DESC, scoped per user', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })

      const first = await seedApproval(db, { userId: alice, status: 'approved' })
      await new Promise((r) => setTimeout(r, 5))
      const second = await seedApproval(db, { userId: alice, status: 'rejected' })
      await new Promise((r) => setTimeout(r, 5))
      const third = await seedApproval(db, { userId: alice, status: 'pending' })
      await seedApproval(db, { userId: bob, status: 'approved' })

      const rows = await db
        .select({
          id: deviceApprovals.id,
          status: deviceApprovals.status,
          userId: deviceApprovals.userId,
        })
        .from(deviceApprovals)
        .where(eq(deviceApprovals.userId, alice))
        .orderBy(desc(deviceApprovals.requestedAt))
        .limit(50)

      expect(rows.map((r) => r.id)).toEqual([third, second, first])
      expect(rows.every((r) => r.userId === alice)).toBe(true)
    } finally {
      await pool.end()
    }
  })
})

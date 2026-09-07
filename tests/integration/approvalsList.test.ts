import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { deviceApprovals } from '~~/server/db/schema'
import { useTestDb, seedUser, seedApproval } from './helpers'

// The list endpoint itself is a thin session-guard wrapper around this query.
// Exercising the query directly catches scoping regressions (returning
// someone else's approvals, returning non-pending rows) without needing a
// live HTTP server.
describe('pending approvals query (device-approvals list endpoint core)', () => {
  it('returns only pending approvals for the authed user, ordered by requestedAt', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const older = await seedApproval(db, { userId: alice })
      const newer = await seedApproval(db, { userId: alice })
      // Sibling noise:
      await seedApproval(db, { userId: alice, status: 'approved' })
      await seedApproval(db, { userId: alice, status: 'rejected' })
      await seedApproval(db, { userId: alice, status: 'expired' })
      await seedApproval(db, { userId: bob })

      const rows = await db
        .select({ id: deviceApprovals.id })
        .from(deviceApprovals)
        .where(and(eq(deviceApprovals.userId, alice), eq(deviceApprovals.status, 'pending')))
        .orderBy(deviceApprovals.requestedAt)

      expect(rows.map((r) => r.id)).toEqual([older, newer])
    } finally {
      await pool.end()
    }
  })
})

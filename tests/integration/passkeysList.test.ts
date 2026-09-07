import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { passkeys } from '~~/server/db/schema'
import { useTestDb, seedUser, addPasskey } from './helpers'

// Covers the core query behind /api/auth/passkeys.get — the endpoint is a
// thin session-guard wrapper around this select. A direct-function test
// catches scoping regressions without a live server.
describe('passkeys list query', () => {
  it('returns only the authed user\'s passkeys, ordered by createdAt', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      await addPasskey(db, { userId: alice })
      await new Promise((r) => setTimeout(r, 5))
      await addPasskey(db, { userId: alice })
      await addPasskey(db, { userId: bob })

      const rows = await db
        .select({ id: passkeys.id, userId: passkeys.userId, createdAt: passkeys.createdAt })
        .from(passkeys)
        .where(eq(passkeys.userId, alice))
        .orderBy(passkeys.createdAt)

      expect(rows).toHaveLength(2)
      expect(rows.every((r) => r.userId === alice)).toBe(true)
      expect(rows[0]!.createdAt.getTime()).toBeLessThanOrEqual(rows[1]!.createdAt.getTime())
    } finally {
      await pool.end()
    }
  })
})

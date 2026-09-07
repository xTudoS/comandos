import { describe, it, expect } from 'vitest'
import { userHasPasskey } from '~~/server/utils/passkeyCheck'
import { useTestDb, seedUser, addPasskey } from './helpers'

describe('userHasPasskey', () => {
  it('returns false when the user has no registered passkeys', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'fresh@example.com' })
      expect(await userHasPasskey(db, userId)).toBe(false)
    } finally {
      await pool.end()
    }
  })

  it('returns true when the user has at least one passkey', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'returning@example.com' })
      await addPasskey(db, { userId })
      expect(await userHasPasskey(db, userId)).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('scopes by user — another user having a passkey does not leak', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      await addPasskey(db, { userId: bob })
      expect(await userHasPasskey(db, alice)).toBe(false)
      expect(await userHasPasskey(db, bob)).toBe(true)
    } finally {
      await pool.end()
    }
  })
})

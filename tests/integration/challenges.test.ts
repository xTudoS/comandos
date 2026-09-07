import { describe, it, expect } from 'vitest'
import { storeChallenge, consumeChallenge, randomChallenge } from '~~/server/utils/challenges'
import { useTestDb, fakeEvent } from './helpers'

describe('challenges', () => {
  it('stores a challenge and consumes it exactly once', async () => {
    const { db, pool } = await useTestDb()
    const event = fakeEvent({ _db: db })
    try {
      const challenge = randomChallenge()
      await storeChallenge(event, {
        challenge,
        purpose: 'login',
        payload: { foo: 'bar' },
      })

      const first = await consumeChallenge(event, { challenge, purpose: 'login' })
      expect(first).toEqual({ payload: { foo: 'bar' } })

      const second = await consumeChallenge(event, { challenge, purpose: 'login' })
      expect(second).toBeNull()
    } finally {
      await pool.end()
    }
  })

  it('does not match a challenge with the wrong purpose', async () => {
    const { db, pool } = await useTestDb()
    const event = fakeEvent({ _db: db })
    try {
      const challenge = randomChallenge()
      await storeChallenge(event, { challenge, purpose: 'login' })
      const result = await consumeChallenge(event, { challenge, purpose: 'device-approval' })
      expect(result).toBeNull()
    } finally {
      await pool.end()
    }
  })

  it('returns null for expired challenges', async () => {
    const { db, pool } = await useTestDb()
    const event = fakeEvent({ _db: db })
    try {
      const challenge = randomChallenge()
      await storeChallenge(event, { challenge, purpose: 'login', ttlSec: 1 })
      await new Promise((r) => setTimeout(r, 1100))
      const result = await consumeChallenge(event, { challenge, purpose: 'login' })
      expect(result).toBeNull()
    } finally {
      await pool.end()
    }
  })
})

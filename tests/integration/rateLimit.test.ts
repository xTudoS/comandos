import { describe, it, expect } from 'vitest'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { useTestDb, fakeEvent } from './helpers'

describe('checkRateLimit', () => {
  it('allows up to `limit` calls in the window, then throws ERR_RATE_LIMITED', async () => {
    const { db, pool } = await useTestDb()
    const event = fakeEvent({ _db: db })
    try {
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(event, { key: 'test:allow', limit: 3, windowSec: 60 })
      }
      await expect(
        checkRateLimit(event, { key: 'test:allow', limit: 3, windowSec: 60 }),
      ).rejects.toMatchObject({
        data: { error: { code: 'ERR_RATE_LIMITED' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('resets the counter once the window elapses', async () => {
    const { db, pool } = await useTestDb()
    const event = fakeEvent({ _db: db })
    try {
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(event, { key: 'test:reset', limit: 3, windowSec: 1 })
      }
      await new Promise((r) => setTimeout(r, 1100))
      await expect(
        checkRateLimit(event, { key: 'test:reset', limit: 3, windowSec: 1 }),
      ).resolves.toBeUndefined()
    } finally {
      await pool.end()
    }
  })

  it('scopes counters by key', async () => {
    const { db, pool } = await useTestDb()
    const event = fakeEvent({ _db: db })
    try {
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(event, { key: 'test:A', limit: 3, windowSec: 60 })
      }
      await expect(
        checkRateLimit(event, { key: 'test:B', limit: 3, windowSec: 60 }),
      ).resolves.toBeUndefined()
    } finally {
      await pool.end()
    }
  })
})

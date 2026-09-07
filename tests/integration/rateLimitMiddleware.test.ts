import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import { applyRateLimit, RATE_LIMIT_RULES } from '~~/server/utils/rateLimitRules'
import { useTestDb, fakeEvent } from './helpers'

type HeaderMap = Record<string, string>

function eventWithHeaders(context: Record<string, unknown>, headers: HeaderMap): H3Event {
  // Minimal H3Event-like used by resolveClientIp / checkRateLimit. We inject
  // the DB under `_db` (the override useDb honors) and mock `req.headers.get`
  // so resolveClientIp can read cf-connecting-ip / fall back to getRequestIP.
  const req = {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  }
  const ev = fakeEvent({ ...context, _db: context._db })
  ;(ev as unknown as { req: typeof req }).req = req
  return ev
}

describe('rate-limit middleware (applyRateLimit)', () => {
  it('blocks after the 30th device-approval challenge within the window', async () => {
    const { db, pool } = await useTestDb()
    try {
      const ev = eventWithHeaders({ _db: db }, { 'cf-connecting-ip': '203.0.113.1' })
      const path = '/api/auth/device-approvals/abc-123/challenge'
      for (let i = 0; i < 30; i++) {
        await applyRateLimit(ev, path)
      }
      await expect(applyRateLimit(ev, path)).rejects.toMatchObject({
        statusCode: 429,
      })
    } finally {
      await pool.end()
    }
  })

  it('uses separate buckets per IP — one IP hitting the cap does not block another', async () => {
    const { db, pool } = await useTestDb()
    try {
      const noisyIp = eventWithHeaders({ _db: db }, { 'cf-connecting-ip': '203.0.113.2' })
      const freshIp = eventWithHeaders({ _db: db }, { 'cf-connecting-ip': '203.0.113.3' })
      const path = '/api/auth/device-approvals/abc/decide'
      for (let i = 0; i < 30; i++) {
        await applyRateLimit(noisyIp, path)
      }
      await expect(applyRateLimit(noisyIp, path)).rejects.toMatchObject({
        statusCode: 429,
      })
      // Fresh IP starts at zero — should sail through.
      await expect(applyRateLimit(freshIp, path)).resolves.toBeUndefined()
    } finally {
      await pool.end()
    }
  })

  it('no-ops on paths that do not match any rule', async () => {
    const { db, pool } = await useTestDb()
    try {
      const ev = eventWithHeaders({ _db: db }, { 'cf-connecting-ip': '203.0.113.4' })
      for (const path of [
        '/',
        '/api/tasks',
        '/api/auth/me',
        '/api/auth/email-otp/send', // intentionally excluded — has inline limits
      ]) {
        for (let i = 0; i < 50; i++) {
          await applyRateLimit(ev, path)
        }
      }
      // Still not throwing after many rounds on unmatched paths.
      await expect(applyRateLimit(ev, '/api/tasks')).resolves.toBeUndefined()
    } finally {
      await pool.end()
    }
  })

  it('passkey sign-in rule matches the canonical better-auth path', () => {
    const rule = RATE_LIMIT_RULES.find((r) => r.label === 'passkey-signin')
    expect(rule).toBeDefined()
    expect(rule!.match.test('/api/auth/sign-in/passkey')).toBe(true)
    expect(rule!.match.test('/api/auth/sign-in/passkey/verify')).toBe(true)
    expect(rule!.match.test('/api/auth/sign-in/email-otp')).toBe(false)
  })
})

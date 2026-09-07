import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import {
  readFingerprint,
  ensureFingerprint,
  clearFingerprint,
} from '~~/server/utils/deviceFingerprint'

function makeEvent(cookieHeader = ''): H3Event {
  const req = { headers: new Headers({ cookie: cookieHeader }) }
  const res = { headers: new Headers() }
  return { req, res } as unknown as H3Event
}

function getSetCookieValue(event: H3Event, name: string): string | null {
  const setCookies = (event as unknown as { res: { headers: Headers } }).res.headers.getSetCookie()
  for (const raw of setCookies) {
    const [pair] = raw.split(';')
    const [cookieName, value] = pair.split('=')
    if (cookieName.trim() === name) return decodeURIComponent(value)
  }
  return null
}

describe('deviceFingerprint', () => {
  it('readFingerprint returns null when cookie is absent', () => {
    expect(readFingerprint(makeEvent())).toBeNull()
  })

  it('readFingerprint returns the cookie value when present', () => {
    const event = makeEvent('device_fingerprint=abc-123')
    expect(readFingerprint(event)).toBe('abc-123')
  })

  it('ensureFingerprint creates and sets a UUID cookie when absent', async () => {
    const event = makeEvent()
    const fp = await ensureFingerprint(event)
    expect(fp).toMatch(/^[0-9a-f-]{36}$/)
    expect(getSetCookieValue(event, 'device_fingerprint')).toBe(fp)
  })

  it('ensureFingerprint returns existing value without rewriting cookie', async () => {
    const event = makeEvent('device_fingerprint=existing-value')
    const fp = await ensureFingerprint(event)
    expect(fp).toBe('existing-value')
    expect((event as unknown as { res: { headers: Headers } }).res.headers.getSetCookie()).toHaveLength(0)
  })

  it('clearFingerprint emits a delete cookie header', () => {
    const event = makeEvent('device_fingerprint=abc-123')
    clearFingerprint(event)
    const setCookies = (event as unknown as { res: { headers: Headers } }).res.headers.getSetCookie()
    expect(setCookies.some((c) => c.startsWith('device_fingerprint=') && /Max-Age=0/i.test(c))).toBe(true)
  })
})

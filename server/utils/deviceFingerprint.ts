import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie } from 'h3'

// Weak signal: this cookie is httpOnly but not signed. It is correlation-only — used to
// display "this device asked to sign in" info in approvals. Never use it for authz.
const COOKIE_NAME = 'device_fingerprint'
const ONE_YEAR_SEC = 60 * 60 * 24 * 365

export function readFingerprint(event: H3Event): string | null {
  return getCookie(event, COOKIE_NAME) ?? null
}

export async function ensureFingerprint(event: H3Event): Promise<string> {
  const existing = readFingerprint(event)
  if (existing) return existing
  const fp = crypto.randomUUID()
  setCookie(event, COOKIE_NAME, fp, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ONE_YEAR_SEC,
    path: '/',
  })
  return fp
}

export function clearFingerprint(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

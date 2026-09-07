import type { H3Event } from 'h3'
import { getRequestHeader, getRequestIP } from 'h3'

/**
 * Resolves the client IP, preferring Cloudflare's `CF-Connecting-IP` header (which is
 * authoritative on Workers and not spoofable by the client) and falling back to h3's
 * `getRequestIP` only when that header is absent (e.g. local dev).
 *
 * Note: the IP is stored/logged for display, not used for authz decisions.
 */
export function resolveClientIp(event: H3Event): string | null {
  const cf = getRequestHeader(event, 'cf-connecting-ip')
  if (cf) return cf
  return getRequestIP(event) ?? null
}

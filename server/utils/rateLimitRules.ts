import type { H3Event } from 'h3'
import { checkRateLimit } from './rateLimit'
import { resolveClientIp } from './requestIp'

type RateLimitRule = {
  match: RegExp
  limit: number
  windowSec: number
  label: string
}

/**
 * Sensitive endpoints to protect with a blanket IP-keyed rate limit at the
 * middleware layer. The OTP send/verify routes are intentionally *not* listed
 * here — they run their own inline rate limits with both email-keyed and
 * IP-keyed checks, which is tighter than a single-key middleware rule can
 * express. Keep additions narrow; every entry runs on every matching
 * request.
 */
export const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  {
    match: /^\/api\/auth\/device-approvals\/[^/]+\/challenge$/,
    limit: 30,
    windowSec: 3600,
    label: 'dev-approval-challenge',
  },
  {
    match: /^\/api\/auth\/device-approvals\/[^/]+\/decide$/,
    limit: 30,
    windowSec: 3600,
    label: 'dev-approval-decide',
  },
  // better-auth's passkey sign-in paths go through the [...handler] catch-all.
  // `/api/auth/sign-in/passkey` is the canonical one; leave the trailing regex
  // open so any sub-path in that family inherits the same bucket.
  {
    match: /^\/api\/auth\/sign-in\/passkey/,
    limit: 30,
    windowSec: 60,
    label: 'passkey-signin',
  },
]

/**
 * Pure-function core — picks the first matching rule for `path` and, if any,
 * consumes a slot in the IP-keyed bucket. No-op otherwise. Lives in utils (not
 * the middleware file) so vitest can import it without hitting Nitro's
 * auto-imported `defineEventHandler`.
 */
export async function applyRateLimit(event: H3Event, path: string): Promise<void> {
  const rule = RATE_LIMIT_RULES.find((r) => r.match.test(path))
  if (!rule) return
  const ip = resolveClientIp(event) ?? '0.0.0.0'
  await checkRateLimit(event, {
    key: `${rule.label}:ip:${ip}`,
    limit: rule.limit,
    windowSec: rule.windowSec,
  })
}

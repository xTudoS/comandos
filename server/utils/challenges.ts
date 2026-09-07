import { and, eq, gt, isNull } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { authChallenges } from '~~/server/db/schema'
import { useDb } from './db'

export type ChallengePurpose = 'login' | 'device-approval'

export function sha256Hex(buf: Buffer | string) {
  return createHash('sha256').update(buf).digest('hex')
}

export function randomChallenge(): string {
  return randomBytes(32).toString('base64url')
}

export async function storeChallenge(
  event: H3Event,
  args: {
    challenge: string
    payload?: unknown
    purpose: ChallengePurpose
    userId?: string | null
    ttlSec?: number
  },
) {
  const db = useDb(event)
  const ttl = args.ttlSec ?? 120
  await db.insert(authChallenges).values({
    challengeHash: sha256Hex(args.challenge),
    payload: args.payload !== undefined ? JSON.stringify(args.payload) : null,
    purpose: args.purpose,
    userId: args.userId ?? null,
    expiresAt: new Date(Date.now() + ttl * 1000),
  })
}

export async function consumeChallenge(
  event: H3Event,
  args: { challenge: string; purpose: ChallengePurpose },
): Promise<{ payload: unknown } | null> {
  const db = useDb(event)
  const hash = sha256Hex(args.challenge)
  const now = new Date()
  // Single atomic UPDATE — the WHERE-clause filter on consumedAt guarantees a
  // challenge is marked consumed at most once even under concurrent requests.
  const updated = await db
    .update(authChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authChallenges.challengeHash, hash),
        eq(authChallenges.purpose, args.purpose),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, now),
      ),
    )
    .returning({ payload: authChallenges.payload })
  const row = updated[0]
  if (!row) return null
  return { payload: row.payload ? JSON.parse(row.payload) : null }
}

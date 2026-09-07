import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import type { H3Event } from 'h3'
import { createHash, sign, type KeyPairKeyObjectResult } from 'node:crypto'
import * as schema from '~~/server/db/schema'
import { canonicalJson, buildDecisionPayload } from '~~/server/utils/signatureAudit'
import { sha256Hex } from '~~/server/utils/challenges'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

/** Banco de testes padrão — SEPARADO do de desenvolvimento, de propósito. */
const DEFAULT_TEST_DB = 'postgres://postgres:postgres@localhost:5432/comando_test'

/**
 * Recusa apagar um banco que não pareça de teste.
 *
 * Isto existe porque o estrago já aconteceu: o fallback deste helper era
 * `comando_dev`, e um `pnpm test` sem `TEST_DATABASE_URL` no ambiente rodou o
 * `TRUNCATE ... CASCADE` abaixo contra o banco de desenvolvimento, levando
 * junto a conta demo, tarefas e quadros. Por muito tempo isso ficou invisível
 * porque os arquivos de integração nem carregavam (o pacote `h3` não resolvia),
 * então o TRUNCATE nunca chegava a rodar.
 *
 * A regra: o nome do banco precisa terminar em `_test`. Para forçar outro
 * (CI com nome próprio, por exemplo), setar `ALLOW_TEST_DB_WIPE=1` — explícito,
 * e nunca por acidente.
 */
function assertWipeable(url: string): void {
  if (process.env.ALLOW_TEST_DB_WIPE === '1') return
  const name = (() => {
    try {
      return new URL(url).pathname.replace(/^\//, '')
    } catch {
      return ''
    }
  })()
  if (name.endsWith('_test')) return
  throw new Error(
    `Recusando TRUNCATE em "${name || url}": não parece um banco de teste.\n` +
      `Os testes de integração APAGAM o banco inteiro.\n` +
      `Use TEST_DATABASE_URL apontando para um banco terminado em "_test" ` +
      `(padrão: ${DEFAULT_TEST_DB}), ou setar ALLOW_TEST_DB_WIPE=1 se tiver certeza.`,
  )
}

export async function useTestDb() {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DB
  assertWipeable(url)
  const pool = new Pool({ connectionString: url, max: 1 })
  const db = drizzle(pool, { schema })
  await db.execute(
    // `booking_links`/`booking_requests` hoje já caem pelo CASCADE de `users`,
    // mas a lista é explícita de propósito: no dia em que `owner_user_id` virar
    // nullable — como já aconteceu com `booking_link_id` — o isolamento entre
    // testes quebraria em silêncio.
    sql`TRUNCATE TABLE users, sessions, accounts, passkeys, verifications, auth_challenges, device_approvals, rate_limit_counters, audit_log, people, person_invitations, tasks, checklist_items, task_annotations, booking_links, booking_requests RESTART IDENTITY CASCADE`,
  )
  return { db, pool }
}

export function fakeEvent(overrides: Record<string, unknown> = {}): H3Event {
  return {
    context: {
      ...overrides,
    },
  } as unknown as H3Event
}

export async function seedUser(db: TestDb, args: { email: string; role?: 'owner' | 'delegate' }) {
  const [u] = await db
    .insert(schema.users)
    .values({
      email: args.email,
      name: args.email.split('@')[0],
      role: args.role ?? 'delegate',
    })
    .returning()
  return u.id
}

export async function addPasskey(db: TestDb, args: { userId: string }) {
  await db.insert(schema.passkeys).values({
    userId: args.userId,
    // `credentialID` com ID maiúsculo — é assim que a coluna se chama em
    // server/db/schema/auth.ts. Com `credentialId` o drizzle não reconhece a
    // chave, emite `default` no INSERT e a inserção morre no NOT NULL de
    // `credential_id` — silenciosamente, porque o objeto passa no type-check.
    credentialID: `cred_${crypto.randomUUID()}`,
    publicKey: 'base64publickey',
  })
}

export async function seedSignInOtp(
  db: TestDb,
  args: { email: string; code: string; expiresAt?: Date },
) {
  await db.insert(schema.verifications).values({
    identifier: `sign-in-otp-${args.email.toLowerCase()}`,
    value: `${args.code}:0`,
    expiresAt: args.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
  })
}

export async function seedSession(
  db: TestDb,
  args: { userId: string; expiresAt?: Date },
): Promise<{ sessionId: string; sessionToken: string }> {
  const token = `sess_${crypto.randomUUID()}`
  const [s] = await db
    .insert(schema.sessions)
    .values({
      userId: args.userId,
      token,
      expiresAt: args.expiresAt ?? new Date(Date.now() + 86_400_000),
    })
    .returning()
  return { sessionId: s!.id, sessionToken: token }
}

export async function seedPasskeyFromKeypair(
  db: TestDb,
  args: { userId: string; keypair: KeyPairKeyObjectResult },
): Promise<{ passkeyId: string; credentialId: string }> {
  const spki = args.keypair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  const credentialId = `cred_${crypto.randomUUID()}`
  const [p] = await db
    .insert(schema.passkeys)
    .values({
      userId: args.userId,
      credentialId,
      publicKey: spki.toString('base64'),
    })
    .returning()
  return { passkeyId: p!.id, credentialId }
}

export async function seedApproval(
  db: TestDb,
  args: {
    userId: string
    requestFingerprint?: string
    requestUserAgent?: string | null
    requestIp?: string | null
    expiresAt?: Date
    status?: 'pending' | 'approved' | 'rejected' | 'expired'
  },
): Promise<string> {
  const [row] = await db
    .insert(schema.deviceApprovals)
    .values({
      userId: args.userId,
      requestFingerprint: args.requestFingerprint ?? 'fp-req',
      requestUserAgent: args.requestUserAgent ?? 'ua-req',
      requestIp: args.requestIp ?? '203.0.113.9',
      status: args.status ?? 'pending',
      expiresAt: args.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000),
    })
    .returning({ id: schema.deviceApprovals.id })
  return row!.id
}

export async function seedDeviceApprovalChallenge(
  db: TestDb,
  args: {
    userId: string
    challenge: string
    payload: unknown
    ttlSec?: number
  },
) {
  await db.insert(schema.authChallenges).values({
    challengeHash: sha256Hex(args.challenge),
    payload: JSON.stringify(args.payload),
    purpose: 'device-approval',
    userId: args.userId,
    expiresAt: new Date(Date.now() + (args.ttlSec ?? 120) * 1000),
  })
}

/**
 * Generates a WebAuthn-style assertion for the given challenge, produced by
 * the supplied ECDSA P-256 keypair. authenticatorData is 37 bytes: the first
 * 32 are the rpIdHash (sha256 of `rpId`) + 1 flag byte + 4 counter bytes.
 */
export function signApproval(args: {
  keypair: KeyPairKeyObjectResult
  challenge: string
  origin: string
  rpId?: string
}) {
  const rpId = args.rpId ?? new URL(args.origin).hostname
  const rpIdHash = createHash('sha256').update(rpId).digest()
  const authenticatorData = Buffer.concat([rpIdHash, Buffer.alloc(5)])
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge: args.challenge, origin: args.origin }),
  )
  const toSign = Buffer.concat([
    authenticatorData,
    createHash('sha256').update(clientDataJSON).digest(),
  ])
  const signature = sign('SHA256', toSign, args.keypair.privateKey)
  return {
    signature: signature.toString('base64'),
    clientDataJSON: clientDataJSON.toString('base64'),
    authenticatorData: authenticatorData.toString('base64'),
  }
}

export { canonicalJson, buildDecisionPayload }

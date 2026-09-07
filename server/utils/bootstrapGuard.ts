import { and, eq, gt } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import {
  users,
  verifications,
  deviceApprovals,
} from '~~/server/db/schema'
import { writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import { userHasPasskey } from './passkeyCheck'
import type { Db } from './db'

const SIGN_IN_OTP_PREFIX = 'sign-in-otp-'
const APPROVAL_TTL_MS = 15 * 60 * 1000

export type OtpStoreMode = 'plain' | 'hashed'

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('base64url').replace(/=+$/, '')
}

async function findValidSignInOtp(
  db: Db,
  args: { email: string; otp: string; storeMode: OtpStoreMode },
): Promise<{ id: string } | null> {
  const identifier = SIGN_IN_OTP_PREFIX + args.email
  const rows = await db
    .select({ id: verifications.id, value: verifications.value })
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, identifier),
        gt(verifications.expiresAt, new Date()),
      ),
    )

  const expected = args.storeMode === 'hashed' ? hashOtp(args.otp) : args.otp
  for (const row of rows) {
    const [storedCode] = row.value.split(':')
    if (storedCode === expected) return { id: row.id }
  }
  return null
}

export type BootstrapGuardInput = {
  email: string
  otp: string
  fingerprint: string
  userAgent: string | null
  ip: string | null
  storeMode?: OtpStoreMode
}

export type BootstrapGuardDecision =
  | { kind: 'proceed'; userId: string }
  | {
      kind: 'approval-required'
      approvalId: string
      userEmail: string
      userAgent: string | null
      ip: string | null
    }

/**
 * Validates the sign-in OTP and, if the user already has a passkey, consumes the
 * OTP and creates a device_approval row instead of letting the OTP produce a session.
 *
 * Order matters for security: we validate the OTP BEFORE checking passkey presence, so
 * an unauthenticated caller can't probe whether an account has a passkey (timing /
 * response-code enumeration). The caller is responsible for invoking better-auth's
 * signInEmailOTP on the 'proceed' branch — which is what consumes the OTP in the
 * no-passkey path. In the passkey path we consume the OTP ourselves to prevent replay.
 */
export async function evaluateBootstrapGuard(
  db: Db,
  input: BootstrapGuardInput,
): Promise<BootstrapGuardDecision> {
  const email = input.email.toLowerCase()
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) throw createApiError(ErrCode.BAD_REQUEST, 'Código inválido ou expirado.')

  const valid = await findValidSignInOtp(db, {
    email,
    otp: input.otp,
    storeMode: input.storeMode ?? 'plain',
  })
  if (!valid) throw createApiError(ErrCode.BAD_REQUEST, 'Código inválido ou expirado.')

  if (!(await userHasPasskey(db, user.id))) {
    return { kind: 'proceed', userId: user.id }
  }

  // Bypass: if an approved approval already exists for this (user, fingerprint)
  // and is still within its claim window, let the OTP sign-in proceed. We
  // consume the approval (flip to 'expired') so it can't be replayed. The OTP
  // itself stays in place — better-auth's signInEmailOTP will consume it on
  // the proceed branch.
  const now = new Date()
  const [claimable] = await db
    .select()
    .from(deviceApprovals)
    .where(
      and(
        eq(deviceApprovals.userId, user.id),
        eq(deviceApprovals.requestFingerprint, input.fingerprint),
        eq(deviceApprovals.status, 'approved'),
        gt(deviceApprovals.expiresAt, now),
      ),
    )
    .limit(1)
  if (claimable) {
    const updated = await db
      .update(deviceApprovals)
      .set({ status: 'expired' })
      .where(and(eq(deviceApprovals.id, claimable.id), eq(deviceApprovals.status, 'approved')))
      .returning({ id: deviceApprovals.id })
    if (updated[0]) {
      await writeAudit(db, {
        entity: 'device_approval',
        entityId: claimable.id,
        action: 'update',
        actorUserId: user.id,
        changes: { status: { from: 'approved', to: 'expired' } },
        context: { reason: 'otp_bootstrap_claim', fingerprint: input.fingerprint },
      })
      return { kind: 'proceed', userId: user.id }
    }
    // Lost the race (another request claimed it between select and update)
    // — fall through to the passkey-block path below.
  }

  const deletion = await db
    .delete(verifications)
    .where(eq(verifications.id, valid.id))
    .returning({ id: verifications.id })
  if (!deletion[0]) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Código inválido ou expirado.')
  }

  const inserted = await db
    .insert(deviceApprovals)
    .values({
      userId: user.id,
      requestFingerprint: input.fingerprint,
      requestUserAgent: input.userAgent,
      requestIp: input.ip,
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    })
    .returning({ id: deviceApprovals.id })

  const approval = inserted[0]
  if (!approval) {
    throw createApiError(ErrCode.INTERNAL, 'Falha ao registrar solicitação de aprovação.')
  }

  return {
    kind: 'approval-required',
    approvalId: approval.id,
    userEmail: user.email,
    userAgent: input.userAgent,
    ip: input.ip,
  }
}

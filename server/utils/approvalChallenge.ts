import { and, eq } from 'drizzle-orm'
import { deviceApprovals, passkeys } from '~~/server/db/schema'
import { buildDecisionPayload, type DecisionKind, type DecisionPayload } from './signatureAudit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type AllowCredential = {
  id: string
  type: 'public-key'
  transports?: string[]
}

export type ApprovalChallenge = {
  challenge: string
  decisionPayload: DecisionPayload
  allowCredentials: AllowCredential[]
  userVerification: 'required'
}

/**
 * Validates that the authenticated user may decide this approval and returns the
 * decision payload, challenge, and list of credentials they can use to sign.
 *
 * Does NOT persist the challenge — the caller should call `storeChallenge` with
 * the returned value to register it in `auth_challenges` with purpose
 * `'device-approval'` and an appropriate TTL.
 */
export async function buildApprovalChallenge(
  db: Db,
  args: { approvalId: string; decidingUserId: string; decision: DecisionKind },
): Promise<ApprovalChallenge> {
  const [approval] = await db
    .select()
    .from(deviceApprovals)
    .where(eq(deviceApprovals.id, args.approvalId))
    .limit(1)
  if (!approval) throw createApiError(ErrCode.NOT_FOUND, 'Aprovação não encontrada.')
  if (approval.userId !== args.decidingUserId) {
    throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')
  }
  if (approval.status !== 'pending') {
    throw createApiError(ErrCode.BAD_REQUEST, 'Aprovação já decidida.')
  }
  if (approval.expiresAt < new Date()) {
    // Opportunistically flip status so the pending_expiry index stops matching
    // and list queries filtering by status='pending' don't return stale rows.
    await db
      .update(deviceApprovals)
      .set({ status: 'expired' })
      .where(and(eq(deviceApprovals.id, approval.id), eq(deviceApprovals.status, 'pending')))
    throw createApiError(ErrCode.APPROVAL_EXPIRED, 'Aprovação expirada.')
  }

  const userPasskeys = await db
    .select({ credentialId: passkeys.credentialID, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, args.decidingUserId))
  if (userPasskeys.length === 0) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Nenhuma passkey registrada nesta conta.')
  }

  const allowCredentials: AllowCredential[] = userPasskeys.map((p) => ({
    id: p.credentialId,
    type: 'public-key' as const,
    transports: p.transports
      ? p.transports
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  }))

  const { payload, challenge } = buildDecisionPayload(approval, args.decision)

  return { challenge, decisionPayload: payload, allowCredentials, userVerification: 'required' }
}

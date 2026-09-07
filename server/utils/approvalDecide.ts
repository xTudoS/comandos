import { createHash } from 'node:crypto'
import { and, eq, isNull, gt } from 'drizzle-orm'
import {
  deviceApprovals,
  passkeys,
  authChallenges,
} from '~~/server/db/schema'
import {
  canonicalJson,
  verifyApprovalAssertion,
  type AssertionInput,
  type DecisionPayload,
} from './signatureAudit'
import { sha256Hex } from './challenges'
import { writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type DecideInput = {
  approvalId: string
  decidingUser: { id: string }
  decidingSession: { id: string }
  credentialId: string
  decisionPayload: DecisionPayload
  assertion: AssertionInput
  expectedOrigin: string
  expectedRpIdHash: Buffer
}

export type DecideResult =
  | { status: 'approved'; approvalId: string }
  | { status: 'rejected'; approvalId: string }

export async function decideApproval(db: Db, input: DecideInput): Promise<DecideResult> {
  const { decisionPayload } = input

  if (decisionPayload.approval_id !== input.approvalId) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Payload não bate com a aprovação.')
  }
  if (decisionPayload.target_user_id !== input.decidingUser.id) {
    throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')
  }

  const [approval] = await db
    .select()
    .from(deviceApprovals)
    .where(eq(deviceApprovals.id, input.approvalId))
    .limit(1)
  if (!approval) throw createApiError(ErrCode.NOT_FOUND, 'Aprovação não encontrada.')
  if (approval.userId !== input.decidingUser.id) {
    throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')
  }
  if (approval.status !== 'pending') {
    throw createApiError(ErrCode.BAD_REQUEST, 'Aprovação já decidida.')
  }
  if (approval.expiresAt < new Date()) {
    throw createApiError(ErrCode.APPROVAL_EXPIRED, 'Aprovação expirada.')
  }

  // Look up the passkey + verify the signature OUTSIDE the tx — these are read-
  // only and failure must bail before we touch any persisted state. The tx
  // below owns the three mutations that must be all-or-nothing: consume the
  // challenge, flip the approval row, and write the audit log (plus the
  // onboarding session insert when approving).
  const [pk] = await db
    .select()
    .from(passkeys)
    .where(and(eq(passkeys.credentialID, input.credentialId), eq(passkeys.userId, input.decidingUser.id)))
    .limit(1)
  if (!pk) {
    throw createApiError(ErrCode.SIGNATURE_INVALID, 'Passkey desconhecida.')
  }

  const challenge = createHash('sha256').update(canonicalJson(decisionPayload)).digest('base64url')
  const ok = await verifyApprovalAssertion({
    decisionPayload,
    expectedChallenge: challenge,
    assertion: input.assertion,
    publicKeySpkiBase64: pk.publicKey,
    expectedOrigin: input.expectedOrigin,
    verifyRpIdHash: true,
    expectedRpIdHash: input.expectedRpIdHash,
  })
  if (!ok) throw createApiError(ErrCode.SIGNATURE_INVALID, 'Assinatura inválida.')

  const decisionKind = decisionPayload.decision
  const newStatus = decisionKind === 'approve' ? 'approved' : 'rejected'

  return await db.transaction(async (tx) => {
    const now = new Date()

    let consumed
    try {
      consumed = await tx
        .update(authChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(authChallenges.challengeHash, sha256Hex(challenge)),
            eq(authChallenges.purpose, 'device-approval'),
            eq(authChallenges.userId, input.decidingUser.id),
            isNull(authChallenges.consumedAt),
            gt(authChallenges.expiresAt, now),
          ),
        )
        .returning({ id: authChallenges.id })
    } catch (e) {
      console.error('[decideApproval] Error consuming authChallenge:', e)
      throw e
    }
    
    if (!consumed[0]) {
      throw createApiError(ErrCode.SIGNATURE_INVALID, 'Challenge inválido ou já usado.')
    }

    let updated
    try {
      updated = await tx
        .update(deviceApprovals)
        .set({
          status: newStatus,
          decidedAt: now,
          decidedBySessionId: input.decidingSession.id,
          decidedWithPasskeyId: pk.id,
          decisionPayload,
          decisionSignature: input.assertion.signature,
          decisionClientData: input.assertion.clientDataJSON,
          decisionAuthenticatorData: input.assertion.authenticatorData,
        })
        .where(and(eq(deviceApprovals.id, input.approvalId), eq(deviceApprovals.status, 'pending')))
        .returning({ id: deviceApprovals.id })
    } catch (e: any) {
      console.error('[decideApproval] Error updating deviceApprovals:', e)
      console.error('[decideApproval] Error cause:', e.cause)
      console.error('[decideApproval] Error keys:', Object.keys(e))
      console.error('[decideApproval] Error JSON:', JSON.stringify(e, Object.getOwnPropertyNames(e)))
      if (e.cause) {
         console.error('[decideApproval] Cause JSON:', JSON.stringify(e.cause, Object.getOwnPropertyNames(e.cause)))
      }
      throw e
    }

    if (!updated[0]) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Aprovação mudou de estado durante a decisão.')
    }

    try {
      await writeAudit(tx, {
        entity: 'device_approval',
        entityId: input.approvalId,
        action: decisionKind === 'approve' ? 'approve' : 'reject',
        actorUserId: input.decidingUser.id,
        changes: { status: { from: 'pending', to: newStatus } },
        context: {
          signed_payload: decisionPayload,
          signature: input.assertion.signature,
          client_data: input.assertion.clientDataJSON,
          authenticator_data: input.assertion.authenticatorData,
          passkey_id: pk.id,
          passkey_credential_id: pk.credentialID,
        },
      })
    } catch (e) {
      console.error('[decideApproval] Error in writeAudit:', e)
      throw e
    }

    return decisionKind === 'approve'
      ? { status: 'approved' as const, approvalId: input.approvalId }
      : { status: 'rejected' as const, approvalId: input.approvalId }
  })
}

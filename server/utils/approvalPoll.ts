import { eq } from 'drizzle-orm'
import { deviceApprovals } from '~~/server/db/schema'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type PollResult =
  | { status: 'pending' }
  | { status: 'approved' }
  | { status: 'rejected' }
  | { status: 'expired' }

/**
 * Lookup + visibility logic for the REQUESTING device's poll endpoint.
 * The caller is responsible for enforcing that `fingerprint` came from a
 * trusted source (typically an httpOnly cookie). Unknown approvals or
 * mismatched fingerprints collapse to a uniform NOT_FOUND so an attacker
 * can't enumerate approval ids.
 *
 * Opportunistically flips a pending-but-past-deadline row to 'expired' so
 * the partial index stays clean — same pattern as the challenge endpoint.
 *
 * Returns ONLY the status: we don't surface any session token via poll. The
 * UI drives the next step (retry OTP) from the status alone; this keeps a
 * fingerprint-cookie leak from becoming an access-token leak.
 */
export async function pollApproval(
  db: Db,
  args: { approvalId: string; fingerprint: string | null },
): Promise<PollResult> {
  if (!args.fingerprint) throw createApiError(ErrCode.NOT_FOUND, 'Não encontrada.')

  const [approval] = await db
    .select()
    .from(deviceApprovals)
    .where(eq(deviceApprovals.id, args.approvalId))
    .limit(1)
  if (!approval || approval.requestFingerprint !== args.fingerprint) {
    throw createApiError(ErrCode.NOT_FOUND, 'Não encontrada.')
  }

  if (approval.status === 'pending' && approval.expiresAt < new Date()) {
    await db
      .update(deviceApprovals)
      .set({ status: 'expired' })
      .where(eq(deviceApprovals.id, approval.id))
    return { status: 'expired' }
  }

  return { status: approval.status }
}

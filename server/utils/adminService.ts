import { eq, sql } from 'drizzle-orm'
import { users, passkeys } from '~~/server/db/schema'
import { deviceApprovals } from '~~/server/db/schema'
import { writeAudit } from './audit'
import type { Db } from './db'

export type AdminUserRow = {
  id: string
  email: string
  name: string
  role: 'owner' | 'delegate'
  createdAt: Date
  passkeyCount: number
}

/**
 * Lists every user in the tenant with their current passkey count. Admin-only;
 * the caller is responsible for the authorization check before invoking.
 */
export async function listUsersWithPasskeyCounts(db: Db): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      passkeyCount: sql<number>`count(${passkeys.id})::int`.as('passkey_count'),
    })
    .from(users)
    .leftJoin(passkeys, eq(passkeys.userId, users.id))
    .groupBy(users.id)
    .orderBy(users.createdAt)
  return rows
}

export type ResetDevicesResult = {
  passkeysDeleted: number
  approvalsDeleted: number
}

/**
 * Wipes every passkey and device_approval row owned by `userId`. Writes a
 * single `update` audit entry against the target user to record who did the
 * reset and how much was nuked. Passkeys and device_approvals are not
 * individually audited (they're infrastructure tables — see eslint
 * AUDITED_TABLES comment), so a summary row is the right granularity.
 */
export async function resetUserDevices(
  db: Db,
  args: { userId: string; actorUserId: string },
): Promise<ResetDevicesResult> {
  return await db.transaction(async (tx) => {
    const existingPasskeys = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(eq(passkeys.userId, args.userId))
    const existingApprovals = await tx
      .select({ id: deviceApprovals.id })
      .from(deviceApprovals)
      .where(eq(deviceApprovals.userId, args.userId))

    await tx.delete(passkeys).where(eq(passkeys.userId, args.userId))
    await tx.delete(deviceApprovals).where(eq(deviceApprovals.userId, args.userId))

    await writeAudit(tx, {
      entity: 'user',
      entityId: args.userId,
      action: 'update',
      actorUserId: args.actorUserId,
      changes: {
        passkeys: { from: existingPasskeys.length, to: 0 },
        deviceApprovals: { from: existingApprovals.length, to: 0 },
      },
      context: { action: 'reset-devices' },
    })

    return {
      passkeysDeleted: existingPasskeys.length,
      approvalsDeleted: existingApprovals.length,
    }
  })
}

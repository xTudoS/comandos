import { and, eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { deviceApprovals } from '~~/server/db/schema'

// Lists the authenticated user's pending device approvals — used by the
// trusted-device banner and settings page to surface approvals for the
// owner to decide on.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const rows = await db
    .select({
      id: deviceApprovals.id,
      requestFingerprint: deviceApprovals.requestFingerprint,
      requestUserAgent: deviceApprovals.requestUserAgent,
      requestIp: deviceApprovals.requestIp,
      requestedAt: deviceApprovals.requestedAt,
      expiresAt: deviceApprovals.expiresAt,
    })
    .from(deviceApprovals)
    .where(and(eq(deviceApprovals.userId, user.id), eq(deviceApprovals.status, 'pending')))
    .orderBy(deviceApprovals.requestedAt)
  return { pending: rows }
})

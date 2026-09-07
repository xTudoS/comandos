import { desc, eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { deviceApprovals } from '~~/server/db/schema'

const HISTORY_LIMIT = 50

// Lists the authenticated user's approval history (all statuses) for the
// settings page. Path-based file routing places this file ahead of
// `[id].get.ts` in Nitro's static-over-dynamic precedence, so the literal
// string 'history' is never matched as an id.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const rows = await db
    .select({
      id: deviceApprovals.id,
      status: deviceApprovals.status,
      requestUserAgent: deviceApprovals.requestUserAgent,
      requestIp: deviceApprovals.requestIp,
      requestedAt: deviceApprovals.requestedAt,
      decidedAt: deviceApprovals.decidedAt,
      expiresAt: deviceApprovals.expiresAt,
    })
    .from(deviceApprovals)
    .where(eq(deviceApprovals.userId, user.id))
    .orderBy(desc(deviceApprovals.requestedAt))
    .limit(HISTORY_LIMIT)
  return { history: rows }
})

import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { passkeys } from '~~/server/db/schema'

// Lists the authenticated user's registered passkeys for the settings page.
// Scoped strictly to the authed user — never leak other users' passkey
// metadata even to admins (that's a separate audit surface).
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const rows = await db
    .select({
      id: passkeys.id,
      deviceType: passkeys.deviceType,
      backedUp: passkeys.backedUp,
      transports: passkeys.transports,
      createdAt: passkeys.createdAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, user.id))
    .orderBy(passkeys.createdAt)
  return { passkeys: rows }
})

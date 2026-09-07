import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { regenerateBookingToken } from '~~/server/utils/bookingService'

/** Gera um token novo. A URL antiga para de funcionar imediatamente. */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  return { link: await regenerateBookingToken(db, user.id) }
})

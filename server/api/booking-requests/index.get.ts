import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listBookingRequests } from '~~/server/utils/bookingService'

const statusSchema = z.enum(['pending', 'accepted', 'rejected', 'cancelled'])

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = getQuery(event)
  const parsed = statusSchema.safeParse(q.status)
  const db = useDb(event)
  const requests = await listBookingRequests(db, {
    ownerUserId: user.id,
    status: parsed.success ? parsed.data : undefined,
  })
  return { requests }
})

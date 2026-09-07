import { useDb } from '~~/server/utils/db'
import { getPublicBookingLink } from '~~/server/utils/bookingService'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { createApiError, ErrCode } from '~~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createApiError(ErrCode.BAD_REQUEST, 'Token ausente.')

  await checkRateLimit(event, {
    key: `booking:get:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`,
    limit: 60,
    windowSec: 60,
  })

  const db = useDb(event)
  return await getPublicBookingLink(db, token)
})

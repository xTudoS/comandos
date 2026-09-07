import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { getFreeRanges } from '~~/server/utils/bookingService'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createApiError(ErrCode.BAD_REQUEST, 'Token ausente.')
  const date = dateSchema.safeParse(getQuery(event).date)
  if (!date.success) throw createApiError(ErrCode.BAD_REQUEST, 'Data inválida.')

  // Limite generoso: a página consulta a cada troca de dia no calendário, e
  // quem está escolhendo horário navega bastante antes de decidir.
  await checkRateLimit(event, {
    key: `booking:free:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`,
    limit: 120,
    windowSec: 60,
  })

  const db = useDb(event)
  return await getFreeRanges(db, { token, date: date.data })
})

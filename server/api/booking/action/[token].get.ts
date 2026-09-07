import { useDb } from '~~/server/utils/db'
import { getRequestByRequesterToken } from '~~/server/utils/bookingService'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { createApiError, ErrCode } from '~~/server/utils/errors'

/**
 * Dados do agendamento por trás do link de ação do email. Rota PÚBLICA — quem
 * clica não tem conta; a autorização é o token.
 *
 * O payload é o mínimo para renderizar a página (ver `RequesterView`): nunca
 * sai daqui id nem email do dono.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createApiError(ErrCode.BAD_REQUEST, 'Token ausente.')

  // Mesmo teto do GET público do link de agendamento. Segura enumeração de
  // token sem atrapalhar quem só recarregou a página.
  await checkRateLimit(event, {
    key: `booking:reqview:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`,
    limit: 60,
    windowSec: 60,
  })

  return await getRequestByRequesterToken(useDb(event), token)
})

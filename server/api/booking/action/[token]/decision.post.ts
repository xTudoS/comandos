import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import {
  getRequestByRequesterToken,
  requesterConfirm,
  requesterDecline,
} from '~~/server/utils/bookingService'
import { declinedByRequesterEmail, sendBestEffort } from '~~/server/utils/bookingEmails'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({ decision: z.enum(['confirmed', 'declined']) })

/**
 * A decisão DO SOLICITANTE, pelo link do email. Rota pública.
 *
 * `confirmed` só carimba. `declined` cancela, arquiva a tarefa criada no aceite
 * e avisa o dono — é o "ela nega no email e a tarefa é cancelada" do pedido.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createApiError(ErrCode.BAD_REQUEST, 'Token ausente.')

  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Dados inválidos.')

  await checkRateLimit(event, {
    key: `booking:reqdecide:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`,
    limit: 20,
    windowSec: 3600,
  })

  const db = useDb(event)

  if (body.data.decision === 'confirmed') {
    return await requesterConfirm(db, token)
  }

  // Lê a visão ANTES de cancelar: `requesterDecline` queima o token, então
  // depois não há mais como montar o payload de resposta a partir dele.
  const view = await getRequestByRequesterToken(db, token)
  const result = await requesterDecline(db, token)

  const message = declinedByRequesterEmail({
    ownerName: result.ownerName,
    requesterName: result.request.requesterName,
    requesterEmail: result.request.requesterEmail,
    appointment: {
      title: result.request.title,
      date: result.request.requestedDate,
      time: String(result.request.requestedTime),
      durationMinutes: result.request.requestedDurationMinutes,
    },
    taskArchived: result.taskArchived,
  })
  await sendBestEffort(useMailer(event), { to: result.ownerEmail, ...message })

  return { ...view, status: 'cancelled' as const, confirmed: false }
})

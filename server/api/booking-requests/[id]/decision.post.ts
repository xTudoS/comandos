import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { decideBookingRequest } from '~~/server/utils/bookingService'
import { acceptedEmail, rejectedEmail, sendBestEffort } from '~~/server/utils/bookingEmails'
import { resolveSiteOrigin } from '~~/server/utils/siteOrigin'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  message: z.string().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.BAD_REQUEST, 'Id inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Dados inválidos.')

  const db = useDb(event)
  const result = await decideBookingRequest(db, {
    ownerUserId: user.id,
    requestId: id.data,
    decision: body.data.decision,
    message: body.data.message,
  })

  const req = result.request
  const appointment = {
    title: req.title,
    date: req.requestedDate,
    time: String(req.requestedTime),
    durationMinutes: req.requestedDurationMinutes,
  }

  // O aceite leva o link de ação; a recusa não, porque não sobrou decisão para
  // o solicitante tomar. `requesterToken` só vem preenchido no aceite.
  const message =
    result.requesterToken !== null
      ? acceptedEmail({
          requesterName: result.requesterName,
          ownerName: user.name,
          appointment,
          message: req.decisionMessage,
          actionUrl: `${resolveSiteOrigin(event)}/agendamento/${result.requesterToken}`,
        })
      : rejectedEmail({
          requesterName: result.requesterName,
          ownerName: user.name,
          appointment,
          message: req.decisionMessage,
        })

  // Best-effort: a decisão já está commitada. Falha de email não pode desfazer
  // o aceite nem devolver erro para o dono, que faria ele clicar de novo e
  // levar "Solicitação já foi decidida".
  await sendBestEffort(useMailer(event), { to: result.requesterEmail, ...message })

  return result.request
})

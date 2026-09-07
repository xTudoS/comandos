import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { prepareInvitation } from '~~/server/utils/invitationService'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import { resolveSiteOrigin } from '~~/server/utils/siteOrigin'

const idSchema = z.string().uuid()
const bodySchema = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.BAD_REQUEST, 'Id inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Email inválido.')

  await checkRateLimit(event, {
    key: `invite:user:${user.id}`,
    limit: 20,
    windowSec: 3600,
  })

  const siteUrl = resolveSiteOrigin(event)
  const db = useDb(event)

  const prepared = await prepareInvitation(db, {
    ownerUserId: user.id,
    inviterName: user.name,
    personId: id.data,
    email: body.data.email,
    siteUrl,
  })

  await useMailer(event).send({
    to: prepared.email,
    subject: 'Você foi convidado para o Comando',
    text:
      `${prepared.inviterName} convidou você para o Comando.\n\n` +
      `Aceite em até 7 dias: ${prepared.inviteLink}\n\n` +
      `Se não reconhece esse convite, pode ignorar este email.`,
  })

  return { ok: true as const, invitationId: prepared.invitationId }
})

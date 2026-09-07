import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { addBoardMember } from '~~/server/utils/boardMembersService'
import { sendParticipantInvites } from '~~/server/utils/invitationService'
import type { ParticipantInvite } from '~~/server/utils/tasksService'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import { resolveSiteOrigin } from '~~/server/utils/siteOrigin'

const bodySchema = z.object({
  personId: z.string().uuid().nullable().optional(),
  name: z.string().max(200).nullable().optional(),
  email: z.string().max(320).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  const db = useDb(event)
  const invites: ParticipantInvite[] = []
  const members = await addBoardMember(db, {
    userId: user.id,
    boardId,
    input: body.data,
    collectInvites: invites,
  })

  // Sem conta vinculada o membro não enxerga nada — o convite é o que fecha o ciclo.
  if (invites.length) {
    const siteUrl = resolveSiteOrigin(event)
    await sendParticipantInvites(db, useMailer(event), {
      inviterName: user.name,
      siteUrl,
      invites,
    })
  }

  return { members }
})

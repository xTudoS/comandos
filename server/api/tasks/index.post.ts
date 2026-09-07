import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createTask, type ParticipantInvite } from '~~/server/utils/tasksService'
import { sendParticipantInvites } from '~~/server/utils/invitationService'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import { taskCreateSchema } from '~~/server/utils/taskInputSchema'
import { resolveSiteOrigin } from '~~/server/utils/siteOrigin'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = taskCreateSchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const invites: ParticipantInvite[] = []
  const row = await createTask(db, { userId: user.id, input: body.data, collectInvites: invites })
  // Convite automático para convidados novos com email — best-effort, pós-commit.
  if (invites.length) {
    const siteUrl = resolveSiteOrigin(event)
    await sendParticipantInvites(db, useMailer(event), {
      inviterName: user.name,
      siteUrl,
      invites,
    })
  }
  setResponseStatus(event, 201)
  return row
})

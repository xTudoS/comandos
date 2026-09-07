import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { addCard } from '~~/server/utils/boardCardsService'
import { sendParticipantInvites } from '~~/server/utils/invitationService'
import { taskCreateSchema } from '~~/server/utils/taskInputSchema'
import type { ParticipantInvite } from '~~/server/utils/tasksService'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import { resolveSiteOrigin } from '~~/server/utils/siteOrigin'

// Ou uma tarefa que já existe (`taskId`), ou uma nova (`task`) criada junto com
// o card na mesma transação. Duas requisições encadeadas virariam duas entradas
// na fila offline, e a segunda referenciaria um id ainda não confirmado.
const bodySchema = z.object({
  taskId: z.string().uuid().optional(),
  task: taskCreateSchema.optional(),
  columnId: z.string().uuid().optional(),
  toIndex: z.number().int().min(0).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  const db = useDb(event)
  const invites: ParticipantInvite[] = []
  const result = await addCard(db, {
    userId: user.id,
    boardId,
    input: body.data,
    collectInvites: invites,
  })

  // Convites dos convidados da tarefa nova — best-effort, pós-commit.
  if (invites.length) {
    const siteUrl = resolveSiteOrigin(event)
    await sendParticipantInvites(db, useMailer(event), {
      inviterName: user.name,
      siteUrl,
      invites,
    })
  }

  setResponseStatus(event, 201)
  return result
})

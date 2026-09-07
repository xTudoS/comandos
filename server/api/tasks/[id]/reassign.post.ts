import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { reassignTask } from '~~/server/utils/tasksService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  targetType: z.enum(['ceo', 'delegate', 'personal']).optional(),
  delegatePersonId: z.string().uuid().nullable(),
  delegateName: z.string().max(200).optional(),
  delegateEmail: z.string().max(320).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await reassignTask(db, {
    userId: user.id,
    taskId: id.data,
    targetType: body.data.targetType,
    delegatePersonId: body.data.delegatePersonId,
    delegateName: body.data.delegateName,
    delegateEmail: body.data.delegateEmail,
  })
})

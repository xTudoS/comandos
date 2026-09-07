import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { completeTask } from '~~/server/utils/tasksService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({ done: z.boolean().optional() })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})))
  const done = parsed.success ? parsed.data.done ?? true : true
  const db = useDb(event)
  return await completeTask(db, { userId: user.id, taskId: id.data, done })
})

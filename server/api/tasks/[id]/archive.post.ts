import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { archiveTask } from '~~/server/utils/tasksService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({ archived: z.boolean().optional() })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})))
  const archived = parsed.success ? parsed.data.archived ?? true : true
  const db = useDb(event)
  return await archiveTask(db, { userId: user.id, taskId: id.data, archived })
})

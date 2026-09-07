import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { canAccessTask } from '~~/server/utils/accessFilter'
import { boardIdsForTask } from '~~/server/utils/boardCardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw createApiError(ErrCode.BAD_REQUEST, 'Tarefa inválida.')

  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
  // Restrito aos quadros que o usuário alcança — ver boardIdsForTask.
  return { boardIds: await boardIdsForTask(db, { userId: user.id, taskId }) }
})

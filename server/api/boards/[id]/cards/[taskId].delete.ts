import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { removeCard } from '~~/server/utils/boardCardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  const taskId = getRouterParam(event, 'taskId')
  if (!boardId || !taskId) throw createApiError(ErrCode.BAD_REQUEST, 'Card inválido.')

  const db = useDb(event)
  // Card inexistente devolve lista vazia, sem erro — o reenvio da fila offline
  // de um DELETE já aplicado não pode estourar.
  const cards = await removeCard(db, { userId: user.id, boardId, taskId })
  return { cards }
})

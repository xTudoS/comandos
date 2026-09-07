import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { assertBoardAccess, listBoardColumns } from '~~/server/utils/boardsService'
import { listBoardCards } from '~~/server/utils/boardCardsService'
import { listBoardMembers } from '~~/server/utils/boardMembersService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')

  const db = useDb(event)
  const { board, isOwner } = await assertBoardAccess(db, { userId: user.id, boardId })

  // Cards magros: só taskId/columnId/position. A tarefa em si vem da lista
  // global de /api/tasks — que já devolve as tarefas dos quadros compartilhados,
  // porque ser membro dá acesso (ver accessFilter.taskFilter).
  const [columns, cards, members] = await Promise.all([
    listBoardColumns(db, boardId),
    listBoardCards(db, boardId),
    listBoardMembers(db, boardId),
  ])

  return { board: { ...board, isOwner }, columns, cards, members }
})

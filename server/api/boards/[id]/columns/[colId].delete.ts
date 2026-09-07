import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { deleteBoardColumn } from '~~/server/utils/boardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  const columnId = getRouterParam(event, 'colId')
  if (!boardId || !columnId) throw createApiError(ErrCode.BAD_REQUEST, 'Coluna inválida.')

  const db = useDb(event)
  // `movedTo` diz para onde os cards da coluna apagada foram — o cliente usa
  // para recolocá-los sem refetch.
  return await deleteBoardColumn(db, { userId: user.id, boardId, columnId })
})

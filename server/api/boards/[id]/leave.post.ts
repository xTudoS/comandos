import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { leaveBoard } from '~~/server/utils/boardMembersService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')
  const db = useDb(event)
  await leaveBoard(db, { userId: user.id, boardId })
  setResponseStatus(event, 204)
  return null
})

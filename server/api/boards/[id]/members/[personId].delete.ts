import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { removeBoardMember } from '~~/server/utils/boardMembersService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  const personId = getRouterParam(event, 'personId')
  if (!boardId || !personId) throw createApiError(ErrCode.BAD_REQUEST, 'Membro inválido.')

  const db = useDb(event)
  const members = await removeBoardMember(db, { userId: user.id, boardId, personId })
  return { members }
})

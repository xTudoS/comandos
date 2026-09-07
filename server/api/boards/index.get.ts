import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listBoards } from '~~/server/utils/boardsService'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = getQuery(event)
  const includeArchived = q.includeArchived === 'true' || q.includeArchived === '1'
  const db = useDb(event)
  const boards = await listBoards(db, { userId: user.id, includeArchived })
  return { boards }
})

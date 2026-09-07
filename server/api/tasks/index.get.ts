import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listTasks } from '~~/server/utils/tasksService'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = getQuery(event)
  const includeArchived = q.includeArchived === 'true' || q.includeArchived === '1'
  const db = useDb(event)
  const rows = await listTasks(db, { userId: user.id, includeArchived })
  return { tasks: rows }
})

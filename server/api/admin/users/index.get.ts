import { useDb } from '~~/server/utils/db'
import { requireOwner } from '~~/server/utils/sessionGuard'
import { listUsersWithPasskeyCounts } from '~~/server/utils/adminService'

export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const db = useDb(event)
  const users = await listUsersWithPasskeyCounts(db)
  return { users }
})

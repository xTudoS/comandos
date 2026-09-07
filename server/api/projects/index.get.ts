import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { countTasksByProject, listProjects } from '~~/server/utils/projectsService'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = getQuery(event)
  const includeArchived = q.includeArchived === 'true' || q.includeArchived === '1'
  const db = useDb(event)
  const rows = await listProjects(db, { userId: user.id, includeArchived })
  const counts = await countTasksByProject(db, { userId: user.id })
  const projects = rows.map((p) => ({ ...p, openTaskCount: counts[p.id] ?? 0 }))
  return { projects }
})

import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { aggregateGoalProgress, listGoals } from '~~/server/utils/goalsService'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = getQuery(event)
  const includeArchived = q.includeArchived === 'true' || q.includeArchived === '1'
  const db = useDb(event)
  const rows = await listGoals(db, { userId: user.id, includeArchived })
  const aggregates = await aggregateGoalProgress(db, { userId: user.id })
  const goals = rows.map((g) => ({
    ...g,
    aggregate: aggregates[g.id] ?? {
      goalId: g.id,
      directTaskTotal: 0,
      directTaskDone: 0,
      projectsTotal: 0,
      projectsDone: 0,
      projectTaskTotal: 0,
      projectTaskDone: 0,
      projectIds: [],
    },
  }))
  return { goals }
})

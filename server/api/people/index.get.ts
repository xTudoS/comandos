import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listPeople } from '~~/server/utils/peopleService'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const rows = await listPeople(db, { ownerUserId: user.id })
  return { people: rows }
})

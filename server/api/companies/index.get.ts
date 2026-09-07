import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listCompanies, listCompaniesWithCounts } from '~~/server/utils/companiesService'

const querySchema = z.object({
  includeArchived: z.string().optional(),
  withCounts: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = querySchema.safeParse(getQuery(event))
  const includeArchived = q.success
    ? q.data.includeArchived === '1' || q.data.includeArchived === 'true'
    : false
  const withCounts = q.success
    ? q.data.withCounts === '1' || q.data.withCounts === 'true'
    : false
  const db = useDb(event)
  if (withCounts) {
    const rows = await listCompaniesWithCounts(db, {
      ownerUserId: user.id,
      includeArchived,
    })
    return { companies: rows }
  }
  const rows = await listCompanies(db, { ownerUserId: user.id, includeArchived })
  return { companies: rows }
})

import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listPayments, paymentsSummary } from '~~/server/utils/paymentsService'

const querySchema = z.object({
  includeArchived: z.string().optional(),
  status: z.enum(['pending', 'paid']).optional(),
  kind: z.enum(['expense', 'income']).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = querySchema.safeParse(getQuery(event))
  const includeArchived = q.success
    ? q.data.includeArchived === 'true' || q.data.includeArchived === '1'
    : false
  const db = useDb(event)
  const [rows, summary] = await Promise.all([
    listPayments(db, {
      userId: user.id,
      includeArchived,
      status: q.success ? q.data.status : undefined,
      kind: q.success ? q.data.kind : undefined,
    }),
    paymentsSummary(db, { userId: user.id }),
  ])
  return { payments: rows, summary }
})

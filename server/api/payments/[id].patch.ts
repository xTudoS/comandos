import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updatePayment } from '~~/server/utils/paymentsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  description: z.string().min(1).max(500).optional(),
  amountCents: z.number().int().positive().optional(),
  dueDate: z.string().min(1).optional(),
  notes: z.string().max(10_000).optional(),
  kind: z.enum(['expense', 'income']).optional(),
  recurrence: z
    .enum(['none', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .optional(),
  companyId: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Pagamento não encontrado.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await updatePayment(db, {
    userId: user.id,
    paymentId: id.data,
    patch: body.data,
  })
})

import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createPayment } from '~~/server/utils/paymentsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  amountCents: z.number().int().positive(),
  dueDate: z.string().min(1, 'Data de vencimento é obrigatória.'),
  notes: z.string().max(10_000).optional(),
  kind: z.enum(['expense', 'income']).optional(),
  recurrence: z
    .enum(['none', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .optional(),
  companyId: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const row = await createPayment(db, { userId: user.id, input: body.data })
  setResponseStatus(event, 201)
  return row
})

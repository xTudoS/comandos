import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createGoal } from '~~/server/utils/goalsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
  category: z.enum(['company', 'product', 'general', 'personal']).optional(),
  dueDate: isoDate.nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  lifeArea: z
    .enum(['corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias'])
    .nullable()
    .optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const row = await createGoal(db, { userId: user.id, input: body.data })
  setResponseStatus(event, 201)
  return row
})

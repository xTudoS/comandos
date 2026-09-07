import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { upsertCheckin } from '~~/server/utils/lifeService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  sleepHours: z.number().min(0).max(24),
  training: z.enum(['none', 'light', 'hard']),
  nutrition: z.number().int().min(0).max(10),
  mood: z.number().int().min(0).max(10),
  energy: z.number().int().min(0).max(10),
  note: z.string().max(280).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await upsertCheckin(db, { userId: user.id, input: body.data })
})

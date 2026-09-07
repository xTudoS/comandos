import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateBookingLink } from '~~/server/utils/bookingService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

// Sem `availability` (disponibilidade semanal acabou) e sem `regenerateToken` —
// trocar o token é destrutivo e tem rota própria.
const bodySchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  defaultDurationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  active: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Dados inválidos.')

  const db = useDb(event)
  return { link: await updateBookingLink(db, { ownerUserId: user.id, patch: body.data }) }
})

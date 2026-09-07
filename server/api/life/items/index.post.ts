import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createLifeItem } from '~~/server/utils/lifeService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  area: z.enum(['corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias']),
  name: z.string().min(1).max(60),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const row = await createLifeItem(db, {
    userId: user.id,
    id: body.data.id,
    area: body.data.area,
    name: body.data.name,
  })
  setResponseStatus(event, 201)
  return row
})

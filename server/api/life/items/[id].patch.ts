import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateLifeItem } from '~~/server/utils/lifeService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  value: z.number().int().min(0).max(10).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Item não encontrado.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await updateLifeItem(db, { userId: user.id, itemId: id.data, patch: body.data })
})

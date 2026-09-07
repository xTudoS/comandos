import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateChecklistItem } from '~~/server/utils/checklistService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  text: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  const cid = idSchema.safeParse(getRouterParam(event, 'cid'))
  if (!id.success || !cid.success) {
    throw createApiError(ErrCode.NOT_FOUND, 'Item não encontrado.')
  }
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await updateChecklistItem(db, {
    userId: user.id,
    taskId: id.data,
    itemId: cid.data,
    patch: body.data,
  })
})

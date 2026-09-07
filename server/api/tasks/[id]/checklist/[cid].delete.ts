import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { deleteChecklistItem } from '~~/server/utils/checklistService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  const cid = idSchema.safeParse(getRouterParam(event, 'cid'))
  if (!id.success || !cid.success) {
    throw createApiError(ErrCode.NOT_FOUND, 'Item não encontrado.')
  }
  const db = useDb(event)
  await deleteChecklistItem(db, { userId: user.id, taskId: id.data, itemId: cid.data })
  return { ok: true as const }
})

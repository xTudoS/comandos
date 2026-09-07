import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireOwner } from '~~/server/utils/sessionGuard'
import { resetUserDevices } from '~~/server/utils/adminService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user } = await requireOwner(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Usuário não encontrado.')
  const db = useDb(event)
  const result = await resetUserDevices(db, {
    userId: id.data,
    actorUserId: user.id,
  })
  return { ok: true as const, ...result }
})

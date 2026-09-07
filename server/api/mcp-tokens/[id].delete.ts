import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { revokeMcpToken } from '~~/server/utils/mcpTokenService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.BAD_REQUEST, 'Id inválido.')

  await revokeMcpToken(useDb(event), { ownerUserId: user.id, id: id.data })
  return { ok: true as const }
})

import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { setAssistant } from '~~/server/utils/peopleService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.BAD_REQUEST, 'Id inválido.')
  const db = useDb(event)
  return await setAssistant(db, { ownerUserId: user.id, personId: id.data })
})

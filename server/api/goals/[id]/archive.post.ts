import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { archiveGoal } from '~~/server/utils/goalsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  archived: z.boolean(),
  cascade: z
    .object({
      projectIds: z.array(z.string().uuid()).optional(),
      taskIds: z.array(z.string().uuid()).optional(),
    })
    .optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Meta não encontrada.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await archiveGoal(db, {
    userId: user.id,
    goalId: id.data,
    archived: body.data.archived,
    cascade: body.data.cascade,
  })
})

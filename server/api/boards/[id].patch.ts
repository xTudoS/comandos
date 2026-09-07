import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateBoard } from '~~/server/utils/boardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  icon: z.string().max(60).optional(),
  color: z.string().max(30).nullable().optional(),
  position: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  const db = useDb(event)
  return await updateBoard(db, { userId: user.id, boardId, patch: body.data })
})

import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createBoardColumn } from '~~/server/utils/boardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  const db = useDb(event)
  const column = await createBoardColumn(db, { userId: user.id, boardId, input: body.data })
  setResponseStatus(event, 201)
  return column
})

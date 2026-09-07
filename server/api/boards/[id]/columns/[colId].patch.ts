import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateBoardColumn } from '~~/server/utils/boardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({ name: z.string().min(1).max(80) })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  const columnId = getRouterParam(event, 'colId')
  if (!boardId || !columnId) throw createApiError(ErrCode.BAD_REQUEST, 'Coluna inválida.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  const db = useDb(event)
  return await updateBoardColumn(db, {
    userId: user.id,
    boardId,
    columnId,
    name: body.data.name,
  })
})

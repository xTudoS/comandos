import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { reorderBoardColumns } from '~~/server/utils/boardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  columnIds: z.array(z.string().uuid()).max(50),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  const db = useDb(event)
  const columns = await reorderBoardColumns(db, {
    userId: user.id,
    boardId,
    columnIds: body.data.columnIds,
  })
  return { columns }
})

import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { moveCard } from '~~/server/utils/boardCardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  taskId: z.string().uuid(),
  columnId: z.string().uuid(),
  toIndex: z.number().int().min(0),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro inválido.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  const db = useDb(event)
  // Devolve as colunas afetadas já normalizadas: o cliente aplica por cima do
  // otimista, então a ordem na tela nunca diverge da gravada.
  const cards = await moveCard(db, { userId: user.id, boardId, ...body.data })
  return { cards }
})

import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createBoard } from '~~/server/utils/boardsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  icon: z.string().max(60).optional(),
  color: z.string().max(30).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const created = await createBoard(db, { userId: user.id, input: body.data })
  setResponseStatus(event, 201)
  return created
})

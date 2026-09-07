import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createChecklistItem } from '~~/server/utils/checklistService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({ text: z.string().min(1).max(500) })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Texto inválido.')
  const db = useDb(event)
  const row = await createChecklistItem(db, {
    userId: user.id,
    taskId: id.data,
    text: body.data.text,
  })
  setResponseStatus(event, 201)
  return row
})

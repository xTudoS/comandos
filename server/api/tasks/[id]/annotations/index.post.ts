import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createAnnotation } from '~~/server/utils/annotationsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({ body: z.string().min(1).max(10_000) })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createApiError(ErrCode.BAD_REQUEST, 'Anotação inválida.')
  const db = useDb(event)
  const row = await createAnnotation(db, {
    userId: user.id,
    taskId: id.data,
    body: parsed.data.body,
  })
  setResponseStatus(event, 201)
  return row
})

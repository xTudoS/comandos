import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { deleteAnnotation } from '~~/server/utils/annotationsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  const aid = idSchema.safeParse(getRouterParam(event, 'aid'))
  if (!id.success || !aid.success) {
    throw createApiError(ErrCode.NOT_FOUND, 'Anotação não encontrada.')
  }
  const db = useDb(event)
  await deleteAnnotation(db, { userId: user.id, taskId: id.data, annotationId: aid.data })
  return { ok: true as const }
})

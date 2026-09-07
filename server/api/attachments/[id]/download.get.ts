import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { getDownloadUrl } from '~~/server/utils/attachmentsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Anexo não encontrado.')
  const db = useDb(event)
  const url = await getDownloadUrl(db, { userId: user.id, attachmentId: id.data })
  return { url, expiresInSeconds: 300 }
})

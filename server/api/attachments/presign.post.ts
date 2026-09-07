import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { MAX_SIZE_BYTES, presignAttachmentUpload } from '~~/server/utils/attachmentsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  entity: z.enum(['task', 'note', 'payment', 'project', 'goal']),
  entityId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive().max(MAX_SIZE_BYTES),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await presignAttachmentUpload(db, {
    userId: user.id,
    ...body.data,
  })
})

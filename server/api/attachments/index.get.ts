import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listAttachments } from '~~/server/utils/attachmentsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const querySchema = z.object({
  entity: z.enum(['task', 'note', 'payment', 'project', 'goal']),
  entityId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = querySchema.safeParse(getQuery(event))
  if (!q.success) throw createApiError(ErrCode.BAD_REQUEST, 'Query inválida.')
  const db = useDb(event)
  const rows = await listAttachments(db, {
    userId: user.id,
    entity: q.data.entity,
    entityId: q.data.entityId,
  })
  return { attachments: rows }
})

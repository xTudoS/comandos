import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listNotes } from '~~/server/utils/notesService'

const querySchema = z.object({
  includeArchived: z.string().optional(),
  type: z.enum(['playbook', 'credential', 'contact', 'decision', 'reference']).optional(),
  projectId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = querySchema.safeParse(getQuery(event))
  const includeArchived = q.success
    ? q.data.includeArchived === 'true' || q.data.includeArchived === '1'
    : false
  const db = useDb(event)
  const rows = await listNotes(db, {
    userId: user.id,
    includeArchived,
    type: q.success ? q.data.type : undefined,
    projectId: q.success ? q.data.projectId : undefined,
  })
  return { notes: rows }
})

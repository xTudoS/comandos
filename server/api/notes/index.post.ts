import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createNote } from '~~/server/utils/notesService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  body: z.string().max(100_000).optional(),
  type: z.enum(['playbook', 'credential', 'contact', 'decision', 'reference']).optional(),
  projectId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'draft']).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const row = await createNote(db, { userId: user.id, input: body.data })
  setResponseStatus(event, 201)
  return row
})

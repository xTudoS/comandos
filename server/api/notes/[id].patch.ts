import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateNote } from '~~/server/utils/notesService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().max(100_000).optional(),
  type: z.enum(['playbook', 'credential', 'contact', 'decision', 'reference']).optional(),
  projectId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'draft']).optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Nota não encontrada.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await updateNote(db, {
    userId: user.id,
    noteId: id.data,
    patch: body.data,
  })
})

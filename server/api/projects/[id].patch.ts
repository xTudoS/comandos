import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateProject } from '~~/server/utils/projectsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(['company', 'product', 'general', 'personal']).optional(),
  parentProjectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  notes: z.string().max(10_000).optional(),
  subjectLabel: z.string().max(120).optional(),
  subjectValue: z.string().max(500).optional(),
  companyId: z.string().uuid().nullable().optional(),
  lifeArea: z
    .enum(['corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias'])
    .nullable()
    .optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Projeto não encontrado.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await updateProject(db, {
    userId: user.id,
    projectId: id.data,
    patch: body.data,
  })
})

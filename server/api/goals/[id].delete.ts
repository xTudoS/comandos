import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { archiveGoal } from '~~/server/utils/goalsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  cascade: z
    .object({
      projectIds: z.array(z.string().uuid()).optional(),
      taskIds: z.array(z.string().uuid()).optional(),
    })
    .optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Meta não encontrada.')
  // Body is optional for DELETE — caller can omit cascade for the default
  // unlink-everything behavior.
  let cascade: { projectIds?: string[]; taskIds?: string[] } | undefined
  try {
    const raw = await readBody(event)
    if (raw && typeof raw === 'object') {
      const body = bodySchema.safeParse(raw)
      if (body.success) cascade = body.data.cascade
    }
  } catch {
    // No body — fine.
  }
  const db = useDb(event)
  // Soft delete: arquiva a meta (e cascateia arquivamento/desvínculo dos filhos)
  // em vez de um DELETE físico. O hard-delete com cascade em cadeia travava o
  // Worker ("code had hung"); o arquivamento reusa o mesmo caminho de `archiveGoal`
  // e some da listagem (listGoals filtra archived=false).
  await archiveGoal(db, { userId: user.id, goalId: id.data, archived: true, cascade })
  return { ok: true as const }
})

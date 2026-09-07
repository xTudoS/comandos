import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { AGENDA_KINDS, listAgenda } from '~~/server/utils/agendaService'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import type { AgendaItemKind } from '~~/shared/agendaItem'

/**
 * `kinds` é uma lista separada por vírgula (`kinds=task,followup`) porque é o
 * que sobrevive a um `GET` cacheável pelo service worker sem virar duas chaves
 * de cache diferentes para a mesma consulta.
 */
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kinds: z
    .string()
    .optional()
    .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
    .refine(
      (list) => !list || list.every((k) => (AGENDA_KINDS as readonly string[]).includes(k)),
      { message: 'kinds inválido.' },
    ),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = querySchema.safeParse(getQuery(event))
  if (!q.success) throw createApiError(ErrCode.BAD_REQUEST, 'Query inválida.')
  const db = useDb(event)
  return await listAgenda(db, {
    userId: user.id,
    from: q.data.from,
    to: q.data.to,
    kinds: q.data.kinds as AgendaItemKind[] | undefined,
  })
})

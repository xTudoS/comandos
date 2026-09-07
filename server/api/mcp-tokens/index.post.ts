import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createMcpToken } from '~~/server/utils/mcpTokenService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  name: z.string().max(120).optional(),
  /** Padrão seguro: só-leitura. Escrita é opt-in explícito. */
  readOnly: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse((await readBody(event)) ?? {})
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Dados inválidos.')

  const { row, token } = await createMcpToken(useDb(event), {
    ownerUserId: user.id,
    name: body.data.name ?? '',
    readOnly: body.data.readOnly ?? true,
  })

  // ÚNICA resposta que carrega o token cru. Não há endpoint para relê-lo — o
  // banco só tem o hash.
  return {
    token,
    id: row.id,
    name: row.name,
    readOnly: row.readOnly,
    createdAt: row.createdAt,
  }
})

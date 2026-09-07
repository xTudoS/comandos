import { and, desc, eq, isNull } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { mcpTokens } from '~~/server/db/schema'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type McpTokenRow = typeof mcpTokens.$inferSelect

/** Prefixo para o token ser reconhecível num log ou num arquivo de config. */
const PREFIX = 'cmdo_'

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export type IssuedToken = {
  row: McpTokenRow
  /** Cru, devolvido UMA vez. Não existe caminho para recuperá-lo depois. */
  token: string
}

export async function createMcpToken(
  db: Db,
  args: { ownerUserId: string; name: string; readOnly: boolean },
): Promise<IssuedToken> {
  const token = `${PREFIX}${randomBytes(32).toString('base64url')}`
  const [row] = await db
    .insert(mcpTokens)
    .values({
      ownerUserId: args.ownerUserId,
      tokenHash: hash(token),
      name: args.name.trim().slice(0, 120),
      readOnly: args.readOnly,
    })
    .returning()
  if (!row) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar o token.')
  return { row, token }
}

/** Lista sem nunca expor o hash — ele não tem por que sair do servidor. */
export async function listMcpTokens(db: Db, ownerUserId: string) {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.ownerUserId, ownerUserId))
    .orderBy(desc(mcpTokens.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    readOnly: r.readOnly,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
    createdAt: r.createdAt,
  }))
}

export async function revokeMcpToken(
  db: Db,
  args: { ownerUserId: string; id: string },
): Promise<void> {
  const [row] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpTokens.id, args.id),
        eq(mcpTokens.ownerUserId, args.ownerUserId),
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning({ id: mcpTokens.id })
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Token não encontrado ou já revogado.')
}

export type McpAuth = { userId: string; readOnly: boolean; tokenId: string }

/**
 * Resolve o `Authorization: Bearer` para um usuário.
 *
 * `lastUsedAt` é atualizado aqui, e é o que permite ao dono olhar a lista e
 * saber qual token está vivo antes de revogar — sem isso, revogar vira aposta.
 */
export async function authenticateMcp(db: Db, header: string | undefined): Promise<McpAuth> {
  const raw = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!raw) throw createApiError(ErrCode.UNAUTHORIZED, 'Token ausente.')

  const [row] = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.tokenHash, hash(raw)))
    .limit(1)
  if (!row || row.revokedAt) {
    // Mesma mensagem para inexistente e revogado: distinguir os dois entrega
    // ao atacante a informação de que acertou um token válido no passado.
    throw createApiError(ErrCode.UNAUTHORIZED, 'Token inválido.')
  }

  await db
    .update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, row.id))

  return { userId: row.ownerUserId, readOnly: row.readOnly, tokenId: row.id }
}

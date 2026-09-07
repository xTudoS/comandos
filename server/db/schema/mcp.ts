import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { users } from './auth'

/**
 * Tokens de acesso do servidor MCP.
 *
 * Claude Code / Desktop não falam passkey nem OTP — não há navegador no meio
 * para um desafio WebAuthn. Então o MCP autentica por token portador, no
 * `Authorization: Bearer`.
 *
 * Guardamos só o sha256, como em `personInvitations` e no token de ação do
 * agendamento: o valor cru aparece UMA vez, na criação, e nunca mais. Um token
 * de longa duração que dá acesso de escrita à conta inteira não pode ficar
 * legível para quem tiver leitura do banco.
 *
 * Revogação é `revokedAt` (soft), não DELETE: saber que um token existiu e
 * quando foi revogado é parte da trilha.
 */
export const mcpTokens = pgTable(
  'mcp_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** Rótulo do usuário ("MacBook", "Claude Desktop") para saber o que revogar. */
    name: text('name').notNull().default(''),
    /**
     * Sessão só-leitura: as ferramentas de escrita nem aparecem no `tools/list`.
     * O padrão é o seguro — quem quiser um agente que cria tarefa marca a caixa.
     */
    readOnly: boolean('read_only').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mcp_tokens_owner_idx').on(t.ownerUserId, t.revokedAt)],
)

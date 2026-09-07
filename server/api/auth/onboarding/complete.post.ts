import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { users } from '~~/server/db/schema'
import { auditedUpdate } from '~~/server/utils/audit'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'

/**
 * Marca o tour de boas-vindas como visto. Chamado tanto pelo "Começar a usar"
 * do último passo quanto pelo "Pular" — do ponto de vista do app é a mesma
 * coisa: a pessoa não deve mais cair no tour.
 *
 * Idempotente: quem já concluiu não tem o carimbo reescrito, e por tabela
 * reflexa não gera uma segunda linha no audit_log a cada recarga da última
 * tela. Por isso a leitura vem antes — `auditedUpdate` atualiza por id, sem
 * condição, então a guarda precisa estar aqui.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)

  const [row] = await db
    .select({ completedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  if (row?.completedAt) return { ok: true as const }

  // `users` está na lista de tabelas auditadas (eslint local/no-raw-db-update):
  // toda mutação passa por aqui para o audit_log continuar confiável.
  await db.transaction((tx) =>
    auditedUpdate(
      tx,
      users,
      user.id,
      user.id,
      { onboardingCompletedAt: new Date(), updatedAt: new Date() },
      { entity: 'user' },
    ),
  )

  return { ok: true as const }
})

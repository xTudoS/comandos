import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { users } from '~~/server/db/schema'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)

  // `onboardingCompletedAt` vem de uma consulta própria, e não do objeto da
  // sessão: o que o better-auth devolve é o que ELE conhece do usuário, e uma
  // coluna nossa adicionada depois não entra nesse mapeamento. Ler do banco
  // também evita servir um valor velho de sessão já emitida.
  const db = useDb(event)
  const [row] = await db
    .select({
      role: users.role,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // Do banco, pelo mesmo motivo do `requireOwner`: o objeto de sessão do
    // better-auth não carrega `role`, então isto respondia 'delegate' para
    // todo mundo — inclusive para o owner.
    role: row?.role ?? 'delegate',
    onboardingCompleted: row?.onboardingCompletedAt != null,
  }
})

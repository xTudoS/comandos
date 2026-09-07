import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { getOrCreateBookingLink } from '~~/server/utils/bookingService'

/**
 * O link de agendamento do usuário, criado na primeira visita.
 *
 * É um GET que escreve, e isso é deliberado: o efeito é idempotente e todo
 * usuário tem exatamente um link, então exigir um POST antes só obrigaria a tela
 * a dois round-trips para conseguir mostrar uma URL.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  return { link: await getOrCreateBookingLink(db, user.id) }
})

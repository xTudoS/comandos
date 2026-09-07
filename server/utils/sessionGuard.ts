import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { useAuth } from './auth'
import { useDb } from './db'
import { users } from '~~/server/db/schema'
import { createApiError, ErrCode } from './errors'

/**
 * Requires a live better-auth session on the incoming request. Delegates cookie
 * parsing and signature verification to better-auth so we stay in sync with
 * whatever cookie name and signing scheme the configured plugins use.
 *
 * Returns the authenticated user + session. Throws ERR_UNAUTHORIZED otherwise.
 */
export async function requireAuthedUser(event: any) {
  const auth = useAuth(event)
  const webReq = toWebRequest(event)
  // Nada de log aqui. Já houve um bloco de `console.log` despejando todos os
  // headers, o header `cookie` cru e a sessão resolvida — ou seja, o token de
  // sessão de cada request autenticada ia parar no log do worker.
  const result = await auth.api.getSession({ headers: webReq.headers })
  if (!result || !result.session || !result.user) {
    throw createApiError(ErrCode.UNAUTHORIZED, 'Sem sessão.')
  }
  return { session: result.session, user: result.user }
}

/**
 * Requires an authenticated user whose `role` is `owner`. Used by admin
 * endpoints — delegates get 403 rather than 404 so the UI can surface
 * "apenas owner" instead of pretending the route doesn't exist.
 */
export async function requireOwner(event: H3Event) {
  const { session, user } = await requireAuthedUser(event)

  // O papel vem do BANCO, não do objeto de sessão.
  //
  // `users.role` é coluna nossa, e o better-auth só devolve os campos que ele
  // próprio conhece (não há `user.additionalFields` na configuração). Então
  // `user.role` era sempre `undefined`, o `!== 'owner'` sempre verdadeiro, e
  // TODA rota de admin respondia 403 — inclusive para quem era owner no banco.
  //
  // A consulta extra só acontece em rota de admin, que é caminho raro; pôr
  // isso em `requireAuthedUser` custaria uma query em toda request autenticada.
  const db = useDb(event)
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (row?.role !== 'owner') {
    throw createApiError(ErrCode.FORBIDDEN, 'Apenas owner.')
  }
  return { session, user: { ...user, role: row.role } }
}

import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { useAuth } from '~~/server/utils/auth'
import { users } from '~~/server/db/schema'
import { createApiError, ErrCode } from '~~/server/utils/errors'

/**
 * Login sem fricção para GRAVAR o webinar (ver docs/apresentacao/).
 *
 * Só funciona quando `runtimeConfig.demoBypass` está setado (NUXT_DEMO_BYPASS=1)
 * — fica DESLIGADO em produção por padrão. Mintamos a sessão reaproveitando o
 * fluxo real do better-auth: `createVerificationOTP` gera um OTP válido (grava
 * em KV + Postgres, sem enviar email) e em seguida fazemos o sign-in com esse
 * código. Sem OTP por email, sem passkey, sem aprovação de dispositivo, sem
 * poluir o audit log. A conta demo não tem passkey, então nem o bootstrapGuard
 * entraria no caminho de aprovação.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.demoBypass) {
    throw createApiError(ErrCode.NOT_FOUND, 'Não encontrado.')
  }

  const email = String(config.demoEmail || '').toLowerCase()
  if (!email) {
    throw createApiError(ErrCode.INTERNAL, 'demoEmail não configurado.')
  }

  const db = useDb(event)
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) {
    throw createApiError(
      ErrCode.BAD_REQUEST,
      `Usuário demo (${email}) não existe. Rode: pnpm db:seed:demo`,
    )
  }

  const auth = useAuth(event)
  const otp = (await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  })) as string

  const webReq = toWebRequest(event)
  const forwardedHeaders = new Headers(webReq.headers)
  forwardedHeaders.set('content-type', 'application/json')
  const forwarded = new Request(new URL('/api/auth/sign-in/email-otp', webReq.url), {
    method: 'POST',
    headers: forwardedHeaders,
    body: JSON.stringify({ email, otp }),
  })
  
  const response = await auth.handler(forwarded)
  if (response.headers && typeof response.headers.getSetCookie === 'function') {
    const cookies = response.headers.getSetCookie()
    for (const cookie of cookies) {
      appendHeader(event, 'set-cookie', cookie)
    }
    response.headers.delete('set-cookie')
  }

  return response
})

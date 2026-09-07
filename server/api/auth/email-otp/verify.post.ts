import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useAuth } from '~~/server/utils/auth'
import { useMailer } from '~~/server/utils/mailer'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import { ensureFingerprint } from '~~/server/utils/deviceFingerprint'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { evaluateBootstrapGuard } from '~~/server/utils/bootstrapGuard'
import { resolveClientIp } from '~~/server/utils/requestIp'

const bodySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
})

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event))
  const email = body.email.toLowerCase()
  const ip = resolveClientIp(event)

  await checkRateLimit(event, { key: `otp-verify:email:${email}`, limit: 10, windowSec: 3600 })
  if (ip) {
    await checkRateLimit(event, { key: `otp-verify:ip:${ip}`, limit: 30, windowSec: 3600 })
  }

  const db = useDb(event)
  const fingerprint = await ensureFingerprint(event)
  const userAgent = getRequestHeader(event, 'user-agent') ?? null

  const decision = await evaluateBootstrapGuard(db, {
    email,
    otp: body.otp,
    fingerprint,
    userAgent,
    ip,
  })

  if (decision.kind === 'approval-required') {
    await useMailer(event).send({
      to: decision.userEmail,
      subject: 'Novo dispositivo pediu acesso ao Comando',
      text:
        `Um dispositivo pediu acesso à sua conta.\n\n` +
        `Dispositivo: ${decision.userAgent || 'desconhecido'}\n` +
        `IP: ${decision.ip ?? 'desconhecido'}\n\n` +
        `Aprove em um dispositivo de confiança em até 15 minutos.`,
    })
    throw createApiError(ErrCode.DEVICE_APPROVAL_REQUIRED, 'Dispositivo precisa de aprovação.', {
      approvalId: decision.approvalId,
    })
  }

  const auth = useAuth(event)
  const webReq = toWebRequest(event)
  const forwardedHeaders = new Headers(webReq.headers)
  forwardedHeaders.set('content-type', 'application/json')
  const forwarded = new Request(new URL('/api/auth/sign-in/email-otp', webReq.url), {
    method: 'POST',
    headers: forwardedHeaders,
    body: JSON.stringify({ email, otp: body.otp }),
  })
  
  const response = await auth.handler(forwarded)
  
  // O Nitro (H3) costuma quebrar múltiplos cabeçalhos Set-Cookie quando eles 
  // vêm de um objeto Response padrão do Web API, concatenando-os com vírgula.
  // Isso invalida os cookies no navegador. Lemos manualmente e usamos appendHeader.
  if (response.headers && typeof response.headers.getSetCookie === 'function') {
    const cookies = response.headers.getSetCookie()
    for (const cookie of cookies) {
      appendHeader(event, 'set-cookie', cookie)
    }
    response.headers.delete('set-cookie')
  }

  return response
})

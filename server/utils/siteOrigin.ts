// `getRequestHost`, `getRequestProtocol` e `useRuntimeConfig` vêm do
// auto-import do Nitro. Importar de 'h3' explicitamente resolveria para os
// tipos do h3 v2, que divergem do runtime v1 — é a origem dos erros de
// typecheck que já existem em requestIp.ts, errors.ts e deviceFingerprint.ts.
//
// O tipo do evento é derivado do próprio helper em vez de importado, para
// casar exatamente com o que o runtime entrega.
type RequestEvent = Parameters<typeof getRequestHost>[0]

/**
 * Hosts pelos quais o app pode ser servido legitimamente.
 *
 * É a MESMA lista que o better-auth usa em `baseURL.allowedHosts`
 * (`server/utils/auth.ts`) — ela é importada de lá para não divergir. O
 * better-auth já resolve a baseURL pelo Host de cada request, então o app
 * autentica corretamente em qualquer host desta lista; o que faltava era o
 * resto do código fazer o mesmo em vez de usar o `siteUrl` estático.
 */
export const ALLOWED_HOSTS = [
  'localhost:3003',
  'comandos.app',
  'hq-brunno-galvao.gitlab-admin-company.workers.dev',
] as const

function hostnameOf(host: string): string {
  // Remove a porta sem quebrar IPv6 entre colchetes.
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1)
  const i = host.indexOf(':')
  return i === -1 ? host : host.slice(0, i)
}

function isLocalHost(host: string): boolean {
  const name = hostnameOf(host)
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
}

/**
 * Origin (protocolo + host) pelo qual ESTA request chegou, quando ele é um
 * host conhecido. Cai no `siteUrl` configurado em qualquer outro caso.
 *
 * Usar isto — e não `config.public.siteUrl` — em tudo que gera link para o
 * usuário (e-mail, link copiável) e em tudo que verifica WebAuthn: senão quem
 * usa o app por `comandos.app` recebe links de `workers.dev` e falha a
 * verificação de assinatura, que é o que acontecia até aqui.
 *
 * Não confia em `x-forwarded-host` (o default do h3 já ignora), e mesmo que
 * confiasse, um host forjado que não esteja na allowlist cai no fallback.
 */
export function resolveSiteOrigin(event: RequestEvent): string {
  // Sem `event`: o runtimeConfig compartilhado já tem as envs aplicadas e não
  // há override por request neste app. Também deixa a função utilizável fora
  // de um request (cron), onde passar um event falso quebraria.
  const config = useRuntimeConfig()
  const fallback = (config.public.siteUrl || 'http://localhost:3000').replace(/\/$/, '')

  let host = ''
  try {
    host = getRequestHost(event)
  } catch {
    return fallback
  }
  if (!host) return fallback

  if (isLocalHost(host)) {
    const protocol = getRequestProtocol(event) || 'http'
    return `${protocol}://${host}`
  }
  if ((ALLOWED_HOSTS as readonly string[]).includes(host)) {
    return `https://${host}`
  }
  return fallback
}

/**
 * Hostname (sem porta) do origin resolvido — é o rpID do WebAuthn.
 *
 * ⚠️ O rpID faz parte da credencial: uma passkey cadastrada com rpID
 * `comandos.app` não funciona em `workers.dev` e vice-versa. Trocar de domínio
 * invalida as passkeys já cadastradas; o caminho de volta é login por OTP.
 */
export function resolveRpId(event: RequestEvent): string {
  return hostnameOf(new URL(resolveSiteOrigin(event)).host)
}

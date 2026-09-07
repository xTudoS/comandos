import { getClientId } from '~/lib/clientId'
import { clearAuthMarker } from '~/lib/authMarker'

// Interceptadores globais do $fetch do cliente (uma única recriação da instância
// global — `$fetch.create` NÃO encadeia interceptores entre instâncias, então
// ambos vivem aqui).
//
//  1. onRequest  — anexa `x-client-id` em TODAS as chamadas. O servidor o devolve
//     como `origin` no broadcast do tempo real, e o originador ignora o próprio
//     eco (ver useRealtimeSync).
//  2. onResponseError — sessão expirada (401) com o app aberto: os $fetch de
//     fundo passam a falhar e, sem isso, o usuário só veria "401 Server Error"
//     cru. Limpa o marcador offline e manda pro /login com aviso de sessão
//     expirada. O middleware de rota só roda em navegação, não cobre este caso.
export default defineNuxtPlugin((nuxtApp) => {
  const clientId = getClientId()

  function isAuthEndpoint(url: unknown): boolean {
    return typeof url === 'string' && url.includes('/api/auth/')
  }

  let redirecting = false
  function onSessionExpired() {
    // DEV: o middleware pula o gate de sessão (QA/screenshots sem login). Não
    // sequestrar o fluxo aqui também, senão o QA quebra. `import.meta.dev` é
    // estaticamente false em produção, então este guard não embarca.
    if (import.meta.dev) return
    if (redirecting) return
    const route = nuxtApp.$router?.currentRoute?.value
    if (route?.path === '/login' || route?.path?.startsWith('/login/')) return
    redirecting = true
    clearAuthMarker()
    const redirect = route?.fullPath
    nuxtApp.runWithContext(() =>
      navigateTo({ path: '/login', query: { expired: '1', ...(redirect ? { redirect } : {}) } }),
    )
  }

  globalThis.$fetch = $fetch.create({
    onRequest({ options }) {
      const headers = new Headers(options.headers as HeadersInit | undefined)
      if (!headers.has('x-client-id')) headers.set('x-client-id', clientId)
      options.headers = headers
    },
    onResponseError({ request, response }) {
      // Só sessão expirada (401). 403 é "sem permissão" — não é caso de relogar.
      // Os próprios endpoints de auth retornam 401 no fluxo normal (ex.: OTP
      // inválido): ignorá-los evita loop de redirect.
      if (response?.status === 401 && !isAuthEndpoint(request)) onSessionExpired()
    },
  })
})

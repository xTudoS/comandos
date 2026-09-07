import { authClient } from '~/lib/authClient'
import { renewAuthMarker, clearAuthMarker, isAuthMarkerValid } from '~/lib/authMarker'

// Global route middleware. Redirects unauthenticated visitors to /login.
// Fails closed on any unhandled error from better-auth.
//
// Public paths (allowlist): the landing (`/`), exact `/login`, anything under
// `/login/`, the onboarding passkey landing, and invite accept URLs. Everything
// else requires a live session. A logged-in visitor to `/` is bounced to the app
// client-side by the landing page itself (see app/pages/index.vue).
const PUBLIC_EXACT = new Set<string>(['/', '/login', '/onboarding/passkey', '/app-shell', '/invite'])
// `/agendamento/` (singular) é o link de ação que vai no email do agendamento —
// confirmar ou desmarcar. É público pelo mesmo motivo de `/agendar/`: quem
// clica não tem conta, e a autorização é o token da própria URL.
// Note a diferença de `/agendamentos` (plural), que é o painel do DONO e segue
// exigindo sessão — o prefixo com barra final não pega essa rota.
const PUBLIC_PREFIXES = ['/login/', '/invite/', '/agendar/', '/agendamento/']

function isPublic(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (isPublic(to.path)) return

  // DEV-ONLY: skip the SSR/client session gate so authenticated full-page loads
  // (used for visual QA / screenshots) don't bounce to /login. `import.meta.dev`
  // is statically false in production builds, so this branch never ships.
  // API routes still enforce auth via the session cookie (sessionGuard).
  if (import.meta.dev) return

  // --- SSR: valida o cookie no servidor (não há localStorage aqui). ---
  if (import.meta.server) {
    let hasSession = false
    try {
      // NÃO usar o `authClient` aqui. No servidor não existe `window.location`,
      // então o better-auth resolve a baseURL pelo `BETTER_AUTH_URL` — que vale
      // "/" (wrangler.jsonc) — e tenta um `fetch('/api/auth/get-session')`. URL
      // relativa estoura no runtime dos Workers, o catch abaixo engolia o erro e
      // TODA página renderizada no servidor era mandada pro /login (era isso que
      // devolvia pro login logo depois do passkey autenticar). O `useRequestFetch`
      // resolve a rota internamente, sem HTTP de verdade, repassando o cookie da
      // requisição atual.
      const session = await useRequestFetch()<{ user?: { id: string } } | null>(
        '/api/auth/get-session',
      )
      hasSession = !!session?.user
    } catch {
      // do nothing, hasSession is already false
    }
    if (!hasSession) return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  // --- Cliente ---
  const session = authClient.useSession()

  // Hidratação inicial (refresh / full load): o gate SSR acima JÁ validou o
  // cookie e renderizou a página. Não revalidar no cliente — era isso que
  // causava o "recarregou, sessão OK, mas pede passkey de novo": o middleware
  // rodava na hidratação com o estado reativo ainda vazio e chutava pra /login.
  // Aqui apenas renovamos o marcador offline quando a sessão já está em memória.
  const nuxtApp = useNuxtApp()
  if (nuxtApp.isHydrating) {
    if (session.value.data) renewAuthMarker(session.value.data.user.id)
    return
  }

  // Navegação SPA: sessão já em memória → segue.
  if (session.value.data) {
    renewAuthMarker(session.value.data.user.id)
    return
  }

  // Sessão não está em memória: resolve de verdade no servidor.
  try {
    const { data } = await authClient.getSession()
    if (data) {
      renewAuthMarker(data.user.id)
      return
    }
    // Servidor respondeu, mas sem sessão: logout real.
    clearAuthMarker()
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  } catch {
    // Servidor inalcançável (offline): usa a janela de graça local.
    if (isAuthMarkerValid()) return
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})

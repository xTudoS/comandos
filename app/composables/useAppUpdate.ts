// useAppUpdate — detecta e aplica novas versões publicadas do app.
//
// Detecção: compara o buildId embutido neste bundle (runtimeConfig.app.buildId)
// com o `id` do manifesto de build do Nuxt (/_nuxt/builds/latest.json). Quando
// diferem, há uma versão nova publicada no servidor e `hasUpdate` vira true.
//
// Aplicação: `updateApp` busca o service worker novo, ESPERA ele terminar de
// instalar e assumir o controle da página, e só então recarrega. Essa espera é
// obrigatória: todas as navegações são respondidas pelo SW a partir do precache
// (NavigationRoute → /app-shell), então recarregar enquanto o SW antigo ainda
// controla a página serve de novo o app-shell velho — e o usuário vê a mesma
// versão por mais que recarregue.

// Junta segmentos de URL evitando barras duplicadas/ausentes.
function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')))
    .join('/')
}

// Garante que o polling automático seja montado uma única vez por sessão,
// mesmo que o composable seja chamado em vários componentes.
let pollingStarted = false

// Teto de espera pela instalação do SW novo (~140 arquivos de precache). Se
// estourar, recarrega assim mesmo: no pior caso cai na versão antiga, que é
// exatamente o comportamento anterior — nunca deixa o botão travado.
const SW_INSTALL_TIMEOUT_MS = 30_000

/** Resolve quando o worker chega a 'activated' (ou vira 'redundant'/estoura o tempo). */
function waitForActivated(sw: ServiceWorker, timeoutMs: number): Promise<boolean> {
  if (sw.state === 'activated') return Promise.resolve(true)
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      sw.removeEventListener('statechange', onState)
      window.clearTimeout(timer)
      resolve(ok)
    }
    const onState = () => {
      // O SW gerado chama self.skipWaiting() no topo, então 'installed' já
      // caminha sozinho para 'activated' — não há etapa de espera manual.
      if (sw.state === 'activated') finish(true)
      else if (sw.state === 'redundant') finish(false)
    }
    const timer = window.setTimeout(() => finish(false), timeoutMs)
    sw.addEventListener('statechange', onState)
  })
}

/**
 * Busca o SW novo e espera ele assumir o controle. Sem isso o reload sai antes
 * da instalação terminar (reg.update() resolve quando a instalação COMEÇA, não
 * quando acaba) e a página volta servida pelo SW antigo.
 */
async function installPendingServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return

  await reg.update().catch(() => {})

  const pending = reg.installing ?? reg.waiting
  // Nada instalando: o SW ativo já é o da build nova (ou o servidor não tem
  // versão nova de fato). Recarregar já basta.
  if (!pending) return

  // O SW gerado pelo workbox não escuta mensagens — o skipWaiting é chamado por
  // ele mesmo. Este postMessage é só um fallback caso o registerType do
  // @vite-pwa/nuxt vire 'prompt' um dia.
  reg.waiting?.postMessage({ type: 'SKIP_WAITING' })

  await waitForActivated(pending, SW_INSTALL_TIMEOUT_MS)
}

export function useAppUpdate() {
  const updating = useState('app:updating', () => false)
  // Há uma versão nova publicada aguardando reload.
  const hasUpdate = useState('app:has-update', () => false)
  const checking = useState('app:checking-update', () => false)

  const { app } = useRuntimeConfig()
  // Caminho do manifesto de build do Nuxt (respeita base/CDN e buildAssetsDir).
  const manifestUrl = joinPath(app.cdnURL || app.baseURL, app.buildAssetsDir, 'builds/latest.json')

  async function checkForUpdate(): Promise<boolean> {
    if (!import.meta.client) return false
    // Sem rede não dá para checar; evita marcar falso-negativo.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
    checking.value = true
    try {
      // no-store + cache-buster (?ts=): o `cache: 'no-store'` cobre o HTTP cache
      // do navegador, mas não impede que um edge/CDN sirva um latest.json velho.
      // O `?ts=` único força um MISS na borda e garante que o manifesto seja
      // sempre o sinal de verdade. Ver navigateFallbackDenylist no nuxt.config
      // (senão a URL com query cai no app-shell e "vai pra auth").
      const bustUrl = `${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`
      const res = await fetch(bustUrl, { cache: 'no-store' })
      if (!res.ok) return hasUpdate.value
      const latest = (await res.json()) as { id?: string }
      // Reflete o servidor nos dois sentidos: se a build publicada voltar a ser
      // a que está rodando (reversão, ou update já aplicado), o aviso some.
      if (latest?.id) hasUpdate.value = latest.id !== app.buildId
      return hasUpdate.value
    } catch {
      // Offline/erro de rede: mantém o estado atual sem alarme falso.
      return hasUpdate.value
    } finally {
      checking.value = false
    }
  }

  async function updateApp(): Promise<void> {
    if (!import.meta.client) return
    updating.value = true
    try {
      await installPendingServiceWorker()
      // Recarrega — agora quem responde a navegação é o SW novo, com o
      // app-shell e os bundles da build nova no precache.
      location.reload()
    } finally {
      updating.value = false
    }
  }

  // Liga o monitoramento automático: na montagem, ao voltar o foco/rede e a
  // cada 30 min. Chamado de um único componente persistente (AppSyncStatus).
  function startUpdatePolling(intervalMs = 30 * 60 * 1000): void {
    if (!import.meta.client || pollingStarted) return
    pollingStarted = true

    const tick = () => {
      // Já sabemos que há update — não precisa continuar consultando.
      if (!hasUpdate.value) void checkForUpdate()
    }

    onMounted(() => {
      tick()
      const id = window.setInterval(tick, intervalMs)
      const onVisible = () => {
        if (document.visibilityState === 'visible') tick()
      }
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener('online', tick)

      onBeforeUnmount(() => {
        window.clearInterval(id)
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener('online', tick)
        pollingStarted = false
      })
    })
  }

  return { updating, hasUpdate, checking, checkForUpdate, updateApp, startUpdatePolling }
}

// useAutoRefresh — mantém os dados frescos automaticamente, sem precisar de F5.
//
// Fase 1 da sincronização "estilo Trello": estratégia de "pull" esperto. Revalida
// TODOS os recursos quando:
//   - a aba volta ao foco / fica visível (você troca de aba e volta atualizado);
//   - em um intervalo fixo enquanto a aba está visível e online.
//
// Pausa o polling com a aba oculta (economiza Worker/Hyperdrive) e quando offline.
// As escritas otimistas pendentes ficam protegidas pelo guard hasPendingForEntity()
// dentro de cada refresh() (ver useOfflineSync.refreshAll).
//
// `setPaused(true)` desliga SÓ o polling periódico — usado enquanto o WebSocket
// (Fase 2) está conectado, já que aí o tempo real substitui o poll. O refetch ao
// focar/voltar a aba é mantido como rede de segurança barata (cobre a janela em
// que o socket esteve suspenso). Quando o WS cai, `setPaused(false)` religa o poll.
//
// Deve ser chamado uma vez a partir do shell autenticado (layouts/default.vue),
// que só monta quando logado — por isso não há checagem extra de sessão aqui.

const POLL_INTERVAL_MS = 25_000

export function useAutoRefresh() {
  if (!import.meta.client) {
    return { start: () => {}, stop: () => {}, setPaused: (_: boolean) => {} }
  }

  const { online } = useOnline()
  const { revalidate } = useOfflineSync()

  let timer: ReturnType<typeof setInterval> | undefined
  let paused = false

  // Revalidação sob demanda (foco/visibilidade): sempre permitida — é barata e
  // só dispara em interação real do usuário, mesmo com o poll pausado pelo WS.
  function revalidateNow() {
    if (online.value && !document.hidden) void revalidate()
  }

  function startPolling() {
    if (timer || paused || document.hidden) return
    timer = setInterval(revalidateNow, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  function onVisibility() {
    if (document.hidden) {
      stopPolling()
    } else {
      revalidateNow() // revalida imediatamente ao voltar para a aba
      startPolling()
    }
  }

  function start() {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', revalidateNow)
    startPolling()
  }

  function stop() {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', revalidateNow)
    stopPolling()
  }

  // Liga/desliga o polling periódico sem mexer no refetch por foco.
  function setPaused(value: boolean) {
    paused = value
    if (value) stopPolling()
    else startPolling()
  }

  return { start, stop, setPaused }
}

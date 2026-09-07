// useRealtimeSync — Fase 2: sincronização em tempo real via WebSocket.
//
// Conecta no worker comando-sync usando um token curto emitido por
// /api/sync/token. Ao receber { type: 'invalidate', entity }, refaz o refresh()
// daquela entidade — reaproveitando o guard de escritas pendentes (igual ao
// auto-refresh). Reconecta com backoff exponencial e faz ping de keep-alive.
//
// Se o tempo real não estiver configurado (sem URL no /api/sync/token, ex.:
// `nuxt dev` puro), fica inativo e o polling da Fase 1 segue como fonte de
// atualização. O polling é mantido em paralelo como rede de segurança (cobre
// mudanças que não passam por um cliente conectado).
//
// Chamado uma vez a partir do shell autenticado (layouts/default.vue).

import { getClientId } from '~/lib/clientId'
import type { Task } from '~/composables/useTasks'
import { useMetasStore } from '~/stores/metas'
import { useProjetosStore } from '~/stores/projetos'
import { useNotesStore } from '~/stores/notes'

const PING_MS = 45_000
const MAX_BACKOFF_MS = 30_000

export function useRealtimeSync() {
  const connected = ref(false)
  if (!import.meta.client) {
    return { start: () => {}, stop: () => {}, connected }
  }

  const tasks = useTasks()
  const projects = useProjects()
  const payments = usePayments()
  const companies = useCompanies()
  const people = usePeople()
  const metas = useMetasStore()
  const projetos = useProjetosStore()
  const notes = useNotesStore()
  const boards = useBoards()
  const route = useRoute()
  const nuxtApp = useNuxtApp()

  // entity (vindo do servidor) → refresh da store correspondente.
  const refreshers: Record<string, () => void> = {
    tasks: () => { void tasks.refresh() },
    // Além da lista (sidebar), recarrega o quadro aberto — a mudança pode ser um
    // card que outro membro moveu, e essa parte do estado é por quadro.
    boards: () => {
      void boards.refresh()
      // Entrar/sair de quadro muda os chips do card, que vêm na linha da tarefa.
      void tasks.refresh()
      const [, first, second] = route.path.split('/')
      // Handler de WebSocket roda fora do setup: runWithContext dá ao useState
      // de dentro do useBoard a instância do Nuxt.
      if (first === 'quadros' && second) {
        void nuxtApp.runWithContext(() => useBoard(second).refresh())
      }
    },
    projects: () => { void projects.refresh(); void projetos.refresh() },
    goals: () => { void metas.refresh() },
    notes: () => { void notes.refresh() },
    payments: () => { void payments.refresh() },
    companies: () => { void companies.refresh() },
    people: () => { void people.refresh() },
  }

  let ws: WebSocket | null = null
  let stopped = true
  let backoff = 1000
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = undefined }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void connect()
    }, backoff)
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
  }

  async function connect() {
    if (stopped || !navigator.onLine) {
      scheduleReconnect()
      return
    }

    let res: { token: string | null; url: string }
    try {
      res = await $fetch<{ token: string | null; url: string }>('/api/sync/token')
    } catch {
      scheduleReconnect()
      return
    }
    const { token, url } = res
    // Tempo real desligado neste ambiente — não reconecta (poll cobre).
    if (!token || !url) return

    try {
      ws = new WebSocket(`${url}?t=${encodeURIComponent(token)}`)
    } catch {
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      connected.value = true
      backoff = 1000
      stopPing()
      pingTimer = setInterval(() => {
        try {
          if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
        } catch {
          // ignora
        }
      }, PING_MS)
    }

    ws.onmessage = (ev) => {
      try {
        const data = typeof ev.data === 'string' ? ev.data : ''
        if (!data || data === 'pong') return
        const msg = JSON.parse(data) as {
          type?: string
          entity?: string
          origin?: string
          data?: Task
          id?: string
        }
        // Ignora o próprio eco: esta aba já aplicou o estado otimista + reconciliou
        // pela resposta do POST/PATCH; reagir aqui só causaria flicker/revert.
        if (msg.origin && msg.origin === getClientId()) return

        // Payload-push das tarefas: aplica a linha pronta (sem refetch).
        if (msg.entity === 'tasks' && msg.type === 'upsert' && msg.data) {
          void tasks.applyRemote(msg.data)
        } else if (msg.entity === 'tasks' && msg.type === 'remove' && msg.id) {
          void tasks.removeRemote(msg.id)
        } else if (msg.entity) {
          // invalidate (ou upsert/remove de entidade sem handler) → refetch.
          refreshers[msg.entity]?.()
        }
      } catch {
        // mensagem inesperada — ignora
      }
    }

    ws.onclose = () => {
      connected.value = false
      stopPing()
      ws = null
      scheduleReconnect()
    }

    ws.onerror = () => {
      try { ws?.close() } catch { /* ignora */ }
    }
  }

  function start() {
    if (!stopped) return
    stopped = false
    void connect()
  }

  function stop() {
    stopped = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = undefined }
    stopPing()
    connected.value = false
    const sock = ws
    ws = null
    try { sock?.close() } catch { /* ignora */ }
  }

  return { start, stop, connected }
}

// useOfflineSync — orquestra o "baixar tudo para uso offline".
//
// Ao montar o shell (logado), dispara o refresh de TODOS os recursos de leitura
// em paralelo. Isso (a) popula o estado compartilhado das telas — deixando a
// navegação instantânea — e (b) aquece o cache do service worker (as respostas
// de /api passam a estar disponíveis offline via StaleWhileRevalidate).
//
// O `status` alimenta o aviso "Pronto para funcionar offline".

import { useMetasStore } from '~/stores/metas'
import { useProjetosStore } from '~/stores/projetos'
import { useNotesStore } from '~/stores/notes'

export type OfflineSyncStatus = 'idle' | 'downloading' | 'ready' | 'error'

/** Estado leve compartilhado — para componentes que só querem ler o status. */
export function useOfflineStatus() {
  return useState<OfflineSyncStatus>('offline-sync:status', () => 'idle')
}

export function useOfflineSync() {
  const status = useOfflineStatus()
  const lastSyncedAt = useState<number | null>('offline-sync:last', () => null)

  // Resolvidos em contexto de setup (singletons compartilhados).
  const tasks = useTasks()
  const projects = useProjects()
  const payments = usePayments()
  const companies = useCompanies()
  const people = usePeople()
  const metas = useMetasStore()
  const projetos = useProjetosStore()
  const notes = useNotesStore()

  /** Refaz a leitura de TODOS os recursos em paralelo. Cada refresh() já protege
   *  escritas otimistas pendentes via hasPendingForEntity(). */
  function refreshAll() {
    return Promise.allSettled([
      tasks.refresh(),
      projects.refresh(),
      payments.refresh(),
      companies.refresh(),
      people.refresh(),
      metas.refresh(),
      projetos.refresh(),
      notes.refresh(),
    ])
  }

  async function warm(): Promise<void> {
    if (!import.meta.client) return
    if (status.value === 'downloading') return
    status.value = 'downloading'

    const results = await refreshAll()

    const anyOk = results.some((r) => r.status === 'fulfilled')
    status.value = anyOk ? 'ready' : 'error'
    if (anyOk) lastSyncedAt.value = Date.now()
  }

  /**
   * Revalidação silenciosa em segundo plano — usada pelo auto-refresh
   * (foco/intervalo) para manter os dados frescos sem F5. Diferente de warm():
   * NÃO mexe no `status`, então o aviso "Pronto para funcionar offline" não
   * pisca a cada ciclo. Ignora chamadas concorrentes e não atropela um warm()
   * em andamento.
   */
  async function revalidate(): Promise<void> {
    if (!import.meta.client) return
    if (revalidating || status.value === 'downloading') return
    revalidating = true
    try {
      const results = await refreshAll()
      if (results.some((r) => r.status === 'fulfilled')) lastSyncedAt.value = Date.now()
    } finally {
      revalidating = false
    }
  }

  return { status, lastSyncedAt, warm, revalidate }
}

// Guard de concorrência do revalidate(), compartilhado entre chamadas do
// composable (singleton de módulo, como o `initialized` do useOnline).
let revalidating = false

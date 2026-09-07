// useSyncStatus — estado da sincronização offline para a UI.
//
// `pending` é mantido reativo por uma assinatura liveQuery do Dexie (ver
// plugins/sync.client.ts). Expõe contagem, estado de sincronização, conexão,
// uma ação manual de sincronizar e o controle do painel.

import type { SyncQueueItem } from '~/types'
import { useSyncManager } from '~/composables/useSyncManager'
import { useOnline } from '~/composables/useOnline'

const ENTITY_LABEL: Record<string, string> = {
  tasks: 'Tarefa',
  projects: 'Projeto',
  payments: 'Pagamento',
  people: 'Pessoa',
  companies: 'Empresa',
  goals: 'Meta',
  notes: 'Nota',
}

const OPERATION_LABEL: Record<string, string> = {
  CREATE: 'Criar',
  UPDATE: 'Atualizar',
  DELETE: 'Excluir',
}

export function entityLabel(entity: string): string {
  return ENTITY_LABEL[entity] ?? entity
}
export function operationLabel(op: string): string {
  return OPERATION_LABEL[op] ?? op
}

export function useSyncStatus() {
  const pending = useState<SyncQueueItem[]>('sync:pending', () => [])
  const panelOpen = useState<boolean>('sync:panel-open', () => false)
  const { isSyncing, processQueue } = useSyncManager()
  const { online } = useOnline()

  const count = computed(() => pending.value.length)
  const hasPending = computed(() => count.value > 0)

  async function syncNow() {
    if (!online.value || isSyncing.value) return
    await processQueue()
  }

  return { pending, count, hasPending, isSyncing, online, panelOpen, syncNow }
}

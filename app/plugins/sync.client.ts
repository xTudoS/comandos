import { watch } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '~/lib/db'
import { useOnline } from '~/composables/useOnline'
import { useSyncManager } from '~/composables/useSyncManager'
import type { SyncQueueItem } from '~/types'

/**
 * Plugin client-only que conecta a detecção de conexão à fila de sincronização.
 *
 * - Inicializa o estado reativo `online` e seus listeners.
 * - Descarrega a fila pendente assim que o app sobe (caso já esteja online).
 * - Re-sincroniza automaticamente toda vez que a conexão volta.
 */
export default defineNuxtPlugin(() => {
  const { online } = useOnline()
  const { processQueue } = useSyncManager()

  // Mantém a fila de sincronização reativa para a UI (indicador de status):
  // o liveQuery do Dexie emite sempre que itens são enfileirados/removidos.
  const pending = useState<SyncQueueItem[]>('sync:pending', () => [])
  liveQuery(() => db.syncQueue.orderBy('timestamp').toArray()).subscribe({
    next: (items) => {
      pending.value = items as SyncQueueItem[]
    },
    error: () => {},
  })

  // Tenta sincronizar no boot (se online).
  if (online.value) {
    void processQueue()
  }

  // Quando a conexão volta (offline -> online), descarrega a fila e, em seguida,
  // recarrega os dados para substituir itens otimistas pela verdade do servidor.
  watch(online, async (isOnline, wasOnline) => {
    if (isOnline && !wasOnline) {
      // 1. Sincroniza a fila (replay das mutações feitas offline).
      await processQueue()
      // 2. Invalida o cache de leitura do SW para o refresh seguinte vir do
      //    servidor (já atualizado pelo passo 1), e não de uma resposta velha.
      if ('caches' in window) {
        try {
          await caches.delete('comando-api')
        } catch {
          // ignora
        }
      }
      // 3. Recarrega os dados frescos (substitui itens otimistas pela verdade
      //    do servidor). Se a rede falhar aqui, o refresh mantém o estado atual.
      try {
        const { useOfflineSync } = await import('~/composables/useOfflineSync')
        await useOfflineSync().warm()
      } catch {
        // sem contexto/erro de import — ignora
      }
    }
  })
})

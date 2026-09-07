import { ref } from 'vue';
import { db } from '~/lib/db';
import type { SyncQueueItem } from '~/types';

const isSyncing = ref(false);

/**
 * Envia um item da fila para a API usando o verbo HTTP correto por operação.
 *  - CREATE -> POST   /api/{entity}
 *  - UPDATE -> PATCH  /api/{entity}/{id}
 *  - DELETE -> DELETE /api/{entity}/{id}
 */
async function pushItem(item: SyncQueueItem) {
  // Forma nova: requisição completa gravada no enfileiramento (cobre endpoints
  // custom como /complete, /archive, /reassign).
  if (item.request) {
    await $fetch(item.request.url, {
      method: item.request.method as any,
      body: item.request.body,
    });
    return;
  }

  // Forma legada: roteamento por entity/operation (notas).
  const id = item.payload?.id;

  switch (item.operation) {
    case 'UPDATE':
      await $fetch(`/api/${item.entity}/${id}`, { method: 'PATCH', body: item.payload });
      break;
    case 'DELETE':
      await $fetch(`/api/${item.entity}/${id}`, { method: 'DELETE' });
      break;
    case 'CREATE':
    default:
      await $fetch(`/api/${item.entity}`, { method: 'POST', body: item.payload });
      break;
  }
}

export const useSyncManager = () => {
  const processQueue = async () => {
    if (isSyncing.value || typeof navigator === 'undefined' || !navigator.onLine) return;

    isSyncing.value = true;
    try {
      const items = await db.syncQueue.orderBy('timestamp').toArray();

      for (const item of items) {
        try {
          await pushItem(item);
          await db.syncQueue.delete(item.id!);
        } catch (error) {
          console.error(`Failed to sync ${item.entity}`, error);
          break; // Para no primeiro erro; tenta de novo na próxima rodada.
        }
      }
    } finally {
      isSyncing.value = false;
    }
  };

  return { processQueue, isSyncing };
};

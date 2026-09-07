// Helpers compartilhados para escrita local-first/offline.
//
// Quando uma mutação falha por falta de conexão, a UI é atualizada de forma
// otimista e a requisição é enfileirada (`syncQueue`) para ser reproduzida
// quando a internet voltar (ver useSyncManager + plugin sync.client.ts).

import { db } from '~/lib/db'

/**
 * True quando o erro é de rede/offline: sem internet OU sem status HTTP (o
 * servidor nunca respondeu). Erros HTTP reais (4xx/5xx) retornam false e devem
 * ser lançados normalmente.
 */
export function isOfflineError(e: unknown): boolean {
  if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return true
  const err = e as { statusCode?: number; status?: number; response?: unknown }
  return err?.statusCode === undefined && err?.status === undefined && err?.response === undefined
}

/**
 * True quando há mutações offline ainda não sincronizadas para a entidade.
 *
 * Usado pelos `refresh()` para NÃO sobrescrever a lista local com uma leitura
 * (do servidor ou do cache velho do Service Worker) enquanto houver alterações
 * otimistas pendentes — senão elas sumiriam da UI ao reabrir o app offline,
 * mesmo continuando na fila. `navigator.onLine` não basta: ele retorna `true`
 * em wifi-sem-internet/captive portal, e aí o $fetch cai no cache do SW.
 */
export async function hasPendingForEntity(entity: string): Promise<boolean> {
  try {
    const count = await db.syncQueue.where('entity').equals(entity).count()
    return count > 0
  } catch {
    return false
  }
}

/** Enfileira uma requisição completa para reprodução ao reconectar. */
export async function queueRequest(
  entity: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  method: string,
  url: string,
  body?: unknown,
): Promise<void> {
  await db.syncQueue.add({
    entity,
    operation,
    request: { method, url, body },
    timestamp: Date.now(),
  })
}

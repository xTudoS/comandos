export interface SyncQueueItem {
  id?: number
  entity: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  payload?: any
  /**
   * Requisição completa a reproduzir quando voltar a conexão. Quando presente,
   * o sync manager a executa diretamente — cobrindo endpoints custom
   * (/complete, /archive, /reassign) além do CRUD padrão. Itens antigos sem
   * `request` caem no roteamento por entity/operation (compat com notas).
   */
  request?: {
    method: string
    url: string
    body?: any
  }
  timestamp: number
}

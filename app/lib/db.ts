import Dexie, { type Table } from 'dexie'
import type { Nota, Tarefa, Projeto, SyncQueueItem } from '~/types'

// Cache local-first: cada recurso guarda sua lista inteira por chave, para
// hidratar a UI instantaneamente ao reabrir o app (inclusive offline, com
// itens criados/editados offline que ainda não sincronizaram).
export interface CacheRow {
  key: string
  value: unknown[]
}

export class ComandoDatabase extends Dexie {
  notes!: Table<Nota>
  tasks!: Table<Tarefa>
  projects!: Table<Projeto>
  syncQueue!: Table<SyncQueueItem>
  cache!: Table<CacheRow>

  constructor() {
    super('ComandoDB')
    this.version(1).stores({
      notes: 'id, projeto_id, atualizada_em',
      tasks: 'id, projeto_id, atualizada_em',
      projects: 'id, atualizada_em',
      syncQueue: '++id, entity, timestamp'
    })
    this.version(2).stores({
      cache: 'key',
    })
  }
}

export const db = new ComandoDatabase()

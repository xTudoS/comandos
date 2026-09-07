// stores/notes.ts — Pinia store para Notas.
//
// Refatorado para Local-First (Dexie) conforme Task 4.
// Mantém a camada de tradução PT snake_case (frontend) <-> EN (backend opcional).

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Nota, TipoNota } from '~/types/nota'
import { db } from '~/lib/db'

// === Backend shape (para sync futuro) ===

type ApiNoteType = 'playbook' | 'credential' | 'contact' | 'decision' | 'reference'
type ApiNoteStatus = 'active' | 'draft'

interface ApiNote {
  id: string
  ownerUserId: string
  title: string
  body: string
  type: ApiNoteType
  projectId: string | null
  companyId: string | null
  status: ApiNoteStatus
  archived: boolean
  createdAt: string
  updatedAt: string
}

// === Mapeamentos ===

const TIPO_API_TO_UI: Record<ApiNoteType, TipoNota> = {
  playbook: 'Playbook',
  credential: 'Credencial',
  contact: 'Contato',
  decision: 'Decisão',
  reference: 'Referência',
}

function fromApi(n: ApiNote): Nota {
  return {
    id: n.id,
    titulo: n.title,
    corpo: n.body ?? '',
    tipo: TIPO_API_TO_UI[n.type],
    projeto_id: n.projectId,
    company_id: n.companyId ?? null,
    status: n.status === 'active' ? 'Ativa' : 'Rascunho',
    arquivada: n.archived,
    criada_em: n.createdAt,
    atualizada_em: n.updatedAt,
  }
}

const TIPO_UI_TO_API: Record<TipoNota, ApiNoteType> = {
  Playbook: 'playbook',
  Credencial: 'credential',
  Contato: 'contact',
  Decisão: 'decision',
  Referência: 'reference',
}

// Corpo no SHAPE DO BACKEND (chaves EN + enums EN + id do cliente) para enfileirar
// no outbox. A fila guardava a `Nota` em PT (titulo/corpo/status:'Ativa'), que o
// servidor rejeitava (400) — a nota ficava "pendente pra sempre" sem sincronizar.
function toApiBody(n: Nota) {
  return {
    id: n.id,
    title: n.titulo,
    body: n.corpo,
    type: TIPO_UI_TO_API[n.tipo],
    projectId: n.projeto_id,
    companyId: n.company_id,
    status: n.status === 'Ativa' ? ('active' as const) : ('draft' as const),
  }
}

interface CreatePayload {
  titulo: string
  corpo?: string
  tipo: TipoNota
  projeto_id?: string | null
  company_id?: string | null
  status?: Nota['status']
}

interface UpdatePayload {
  titulo?: string
  corpo?: string
  tipo?: TipoNota
  projeto_id?: string | null
  company_id?: string | null
  status?: Nota['status']
}

// === Store ===

export const useNotesStore = defineStore('notes', () => {
  const list = ref<Nota[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const ativas = computed(() => list.value.filter((n) => !n.arquivada))
  const arquivadas = computed(() => list.value.filter((n) => n.arquivada))

  function byId(id: string): Nota | undefined {
    return list.value.find((n) => n.id === id)
  }

  function porTipo(tipo: TipoNota): Nota[] {
    return ativas.value.filter((n) => n.tipo === tipo)
  }

  /**
   * refresh: Carrega localmente e sincroniza com API em background.
   */
  async function refresh(opts: { includeArchived?: boolean } = {}): Promise<void> {
    loading.value = true
    error.value = null

    // 1. Carregar do Dexie IMEDIATAMENTE
    try {
      list.value = await db.notes.toArray()
    } catch (e) {
      console.error('Falha ao carregar do Dexie:', e)
    }

    // 2. Tentar atualizar via API (Background Sync)
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived) query.includeArchived = '1'
      const res = await $fetch<{ notes: ApiNote[] }>('/api/notes', { query })
      const remoteNotes = res.notes.map(fromApi)

      // Atualizar Dexie com o que veio do servidor
      await db.notes.bulkPut(remoteNotes)

      // Refletir no estado local
      list.value = await db.notes.toArray()
    } catch (e) {
      // Offline ou erro na API não trava o app
      error.value = (e as { message?: string })?.message ?? 'Offline: Usando dados locais.'
    } finally {
      loading.value = false
    }
  }

  async function criar(payload: CreatePayload): Promise<Nota> {
    const nota: Nota = {
      id: crypto.randomUUID(),
      titulo: payload.titulo,
      corpo: payload.corpo ?? '',
      tipo: payload.tipo,
      projeto_id: payload.projeto_id ?? null,
      company_id: payload.company_id ?? null,
      status: payload.status ?? 'Ativa',
      arquivada: false,
      criada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
    }

    // Local-first
    await db.notes.add(nota)
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'CREATE',
      payload: toApiBody(nota),
      timestamp: Date.now(),
    })

    list.value = [nota, ...list.value]
    return nota
  }

  async function atualizar(id: string, payload: UpdatePayload): Promise<Nota> {
    const existing = list.value.find((n) => n.id === id)
    if (!existing) throw new Error('Nota não encontrada.')

    const updated: Nota = {
      ...existing,
      ...payload,
      atualizada_em: new Date().toISOString(),
    }

    // Local-first
    await db.notes.put(updated)
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'UPDATE',
      payload: toApiBody(updated),
      timestamp: Date.now(),
    })

    const idx = list.value.findIndex((n) => n.id === id)
    if (idx >= 0) list.value[idx] = updated
    return updated
  }

  async function arquivar(id: string, arquivada = true): Promise<void> {
    const existing = list.value.find((n) => n.id === id)
    if (!existing) throw new Error('Nota não encontrada.')

    const updated: Nota = {
      ...existing,
      arquivada,
      atualizada_em: new Date().toISOString(),
    }

    await db.notes.put(updated)
    // NB: o PATCH /api/notes não tem campo `archived` (não há endpoint de
    // arquivar nota). Enfileiramos um corpo válido só para a fila não travar
    // com 400; o estado `arquivada` ainda não persiste no servidor (gap aberto).
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'UPDATE',
      payload: toApiBody(updated),
      timestamp: Date.now(),
    })

    const idx = list.value.findIndex((n) => n.id === id)
    if (idx >= 0) list.value[idx] = updated
  }

  async function deletar(id: string): Promise<void> {
    await db.notes.delete(id)
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'DELETE',
      payload: { id },
      timestamp: Date.now(),
    })

    list.value = list.value.filter((n) => n.id !== id)
  }

  return {
    // state
    list,
    loading,
    error,
    // getters
    ativas,
    arquivadas,
    byId,
    porTipo,
    // actions
    refresh,
    criar,
    atualizar,
    arquivar,
    deletar,
    // aliases spec Task 4
    loadNotes: refresh,
    addNote: criar,
  }
})

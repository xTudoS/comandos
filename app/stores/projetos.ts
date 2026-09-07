// stores/projetos.ts — Pinia store para Projetos.
//
// Camada de tradução: o backend usa nomes em inglês
// (`name, category='company'|..., parentProjectId, goalId, notes, archived`);
// o spec usa PT (`nome, categoria='empresa'|..., empresa_id, meta_id, notas,
// arquivado`). Esta store é a única fronteira; componentes só veem o tipo
// Projeto da spec.
//
// `openTaskCount` é derivado por API e exposto fora do tipo Projeto da spec
// via `taskCount(id)` getter.

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Projeto, CategoriaProjeto } from '~/types/projeto'
import type { LifeAreaKey } from '~/composables/useLifeTracker'
import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

// === Backend shape ===

type ApiProjectCategory = 'company' | 'product' | 'general' | 'personal'

interface ApiProject {
  id: string
  ownerUserId: string
  name: string
  category: ApiProjectCategory
  parentProjectId: string | null
  goalId: string | null
  companyId: string | null
  lifeArea: LifeAreaKey | null
  notes: string
  subjectLabel: string
  subjectValue: string
  archived: boolean
  createdAt: string
  updatedAt: string
  openTaskCount?: number
}

const CATEGORIA_API_TO_UI: Record<ApiProjectCategory, CategoriaProjeto> = {
  company: 'empresa',
  product: 'produto',
  general: 'geral',
  personal: 'pessoal',
}

const CATEGORIA_UI_TO_API: Record<CategoriaProjeto, ApiProjectCategory> = {
  empresa: 'company',
  produto: 'product',
  geral: 'general',
  pessoal: 'personal',
}

function fromApi(p: ApiProject): Projeto {
  return {
    id: p.id,
    nome: p.name,
    categoria: CATEGORIA_API_TO_UI[p.category],
    // Backend usa parentProjectId genérico; spec chama isso de empresa_id
    // (faz sentido só quando categoria='produto'). Para outras categorias o
    // parent é nulo, mantemos null aqui.
    empresa_id: p.category === 'product' ? p.parentProjectId : null,
    meta_id: p.goalId,
    company_id: p.companyId,
    area_vida: p.lifeArea ?? null,
    notas: p.notes ?? '',
    campo_label: p.subjectLabel ?? '',
    campo_valor: p.subjectValue ?? '',
    arquivado: p.archived,
    criada_em: p.createdAt,
    atualizada_em: p.updatedAt,
  }
}

interface CreatePayload {
  nome: string
  categoria: CategoriaProjeto
  empresa_id?: string | null
  meta_id?: string | null
  company_id?: string | null
  notas?: string
  campo_label?: string
  campo_valor?: string
  area_vida?: LifeAreaKey | null
}

interface UpdatePayload {
  nome?: string
  categoria?: CategoriaProjeto
  empresa_id?: string | null
  meta_id?: string | null
  company_id?: string | null
  notas?: string
  campo_label?: string
  campo_valor?: string
  area_vida?: LifeAreaKey | null
}

function toApiCreate(p: CreatePayload): Record<string, unknown> {
  return {
    name: p.nome,
    category: CATEGORIA_UI_TO_API[p.categoria],
    parentProjectId: p.categoria === 'produto' ? (p.empresa_id ?? null) : null,
    goalId: p.meta_id ?? null,
    companyId: p.company_id ?? null,
    notes: p.notas,
    subjectLabel: p.campo_label ?? '',
    subjectValue: p.campo_valor ?? '',
    lifeArea: p.area_vida ?? null,
  }
}

function toApiPatch(p: UpdatePayload): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (p.nome !== undefined) out.name = p.nome
  if (p.categoria !== undefined) out.category = CATEGORIA_UI_TO_API[p.categoria]
  if (p.empresa_id !== undefined) {
    out.parentProjectId =
      (p.categoria ?? undefined) === 'produto' || p.empresa_id !== null
        ? p.empresa_id
        : null
  }
  if (p.meta_id !== undefined) out.goalId = p.meta_id
  if (p.company_id !== undefined) out.companyId = p.company_id
  if (p.notas !== undefined) out.notes = p.notas
  if (p.campo_label !== undefined) out.subjectLabel = p.campo_label
  if (p.campo_valor !== undefined) out.subjectValue = p.campo_valor
  if (p.area_vida !== undefined) out.lifeArea = p.area_vida
  return out
}

// === Store ===

export const useProjetosStore = defineStore('projetos', () => {
  const list = ref<Projeto[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  // Map paralelo id → openTaskCount (mantido fora de Projeto pois o tipo da
  // spec não tem esse campo).
  const taskCounts = ref<Record<string, number>>({})
  const sessionNewIds = ref<Record<string, boolean>>({})

  const ativos = computed(() => list.value.filter((p) => !p.arquivado))

  function byId(id: string | null | undefined): Projeto | undefined {
    if (!id) return undefined
    return list.value.find((p) => p.id === id)
  }

  function nomePorId(id: string | null | undefined): string | null {
    return byId(id)?.nome ?? null
  }

  function taskCount(id: string): number {
    return taskCounts.value[id] ?? 0
  }

  function porCategoria(c: CategoriaProjeto): Projeto[] {
    return ativos.value.filter((p) => p.categoria === c)
  }

  function porMeta(metaId: string): Projeto[] {
    return ativos.value.filter((p) => p.meta_id === metaId)
  }

  async function refresh(opts: { includeArchived?: boolean } = {}): Promise<void> {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived) query.includeArchived = '1'
      const res = await $fetch<{ projects: ApiProject[] }>('/api/projects', { query })
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('projects'))) {
        list.value = res.projects.map(fromApi)
        const counts: Record<string, number> = {}
        for (const p of res.projects) counts[p.id] = p.openTaskCount ?? 0
        taskCounts.value = counts
      }
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar projetos.'
    } finally {
      loading.value = false
    }
  }

  async function criar(payload: CreatePayload): Promise<Projeto> {
    // Id gerado no cliente e enviado ao servidor: vira a fonte da verdade, então
    // não há id "stale" depois do sync (PATCH/archive offline não dão mais 404).
    const id = import.meta.client ? crypto.randomUUID() : undefined
    const body = id ? { ...toApiCreate(payload), id } : toApiCreate(payload)
    try {
      const row = await $fetch<ApiProject>('/api/projects', { method: 'POST', body })
      const projeto = fromApi(row)
      sessionNewIds.value[projeto.id] = true
      list.value = [projeto, ...list.value]
      taskCounts.value = { ...taskCounts.value, [projeto.id]: 0 }
      return projeto
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const now = new Date().toISOString()
      const optimistic: Projeto = {
        id: id ?? `tmp-${now}`,
        nome: payload.nome,
        categoria: payload.categoria,
        empresa_id: payload.categoria === 'produto' ? (payload.empresa_id ?? null) : null,
        meta_id: payload.meta_id ?? null,
        company_id: payload.company_id ?? null,
        area_vida: payload.area_vida ?? null,
        notas: payload.notas ?? '',
        campo_label: payload.campo_label ?? '',
        campo_valor: payload.campo_valor ?? '',
        arquivado: false,
        criada_em: now,
        atualizada_em: now,
      }
      sessionNewIds.value[optimistic.id] = true
      list.value = [optimistic, ...list.value]
      taskCounts.value = { ...taskCounts.value, [optimistic.id]: 0 }
      await queueRequest('projects', 'CREATE', 'POST', '/api/projects', body)
      return optimistic
    }
  }

  async function atualizar(id: string, payload: UpdatePayload): Promise<Projeto> {
    const body = toApiPatch(payload)
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    try {
      const row = await $fetch<ApiProject>(`/api/projects/${id}`, { method: 'PATCH', body })
      const projeto = fromApi(row)
      const i = list.value.findIndex((p) => p.id === id)
      if (i >= 0) list.value[i] = projeto
      return projeto
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const optimistic: Projeto = {
        ...(prev as Projeto),
        nome: payload.nome ?? prev?.nome ?? '',
        categoria: payload.categoria ?? prev?.categoria ?? 'geral',
        empresa_id: payload.empresa_id !== undefined ? payload.empresa_id : (prev?.empresa_id ?? null),
        meta_id: payload.meta_id !== undefined ? payload.meta_id : (prev?.meta_id ?? null),
        company_id: payload.company_id !== undefined ? payload.company_id : (prev?.company_id ?? null),
        area_vida: payload.area_vida !== undefined ? payload.area_vida : (prev?.area_vida ?? null),
        notas: payload.notas ?? prev?.notas ?? '',
        atualizada_em: new Date().toISOString(),
      }
      if (idx >= 0) list.value[idx] = optimistic
      await queueRequest('projects', 'UPDATE', 'PATCH', `/api/projects/${id}`, body)
      return optimistic
    }
  }

  async function arquivar(id: string, arquivado = true): Promise<void> {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, arquivado }
    try {
      await $fetch(`/api/projects/${id}/archive`, { method: 'POST', body: { archived: arquivado } })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('projects', 'UPDATE', 'POST', `/api/projects/${id}/archive`, { archived: arquivado })
    }
  }

  async function deletar(id: string): Promise<void> {
    const prevList = list.value
    list.value = list.value.filter((p) => p.id !== id)
    const next = { ...taskCounts.value }
    delete next[id]
    taskCounts.value = next
    try {
      await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
    } catch (e) {
      if (!isOfflineError(e)) {
        list.value = prevList
        throw e
      }
      await queueRequest('projects', 'DELETE', 'DELETE', `/api/projects/${id}`)
    }
  }

  return {
    // state
    list,
    loading,
    error,
    // getters
    ativos,
    byId,
    nomePorId,
    taskCount,
    porCategoria,
    porMeta,
    // actions
    refresh,
    criar,
    atualizar,
    arquivar,
    deletar,
    sessionNewIds,
  }
})

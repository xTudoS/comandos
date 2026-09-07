// stores/metas.ts — Pinia store para Metas (spec §10.1, §10.4 e §7.14).
//
// Camada de tradução: o backend usa nomes em inglês
// (`title, description, dueDate, archived`); o spec usa PT
// (`titulo, descricao, prazo, arquivada`). Componentes só veem o tipo Meta
// da spec; agregados de progresso são expostos fora do tipo via getters
// (`progressoMeta(id)` / `statusMeta(meta)`).

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Meta, StatusMeta } from '~/types/meta'
import type { ProgressoMeta } from '~/composables/useProgresso'
import type { LifeAreaKey } from '~/composables/useLifeTracker'
import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

// === Backend shape ===

interface ApiGoalAggregate {
  goalId: string
  directTaskTotal: number
  directTaskDone: number
  projectsTotal: number
  projectsDone: number
  projectTaskTotal: number
  projectTaskDone: number
  projectIds: string[]
}

type ApiGoalCategory = 'company' | 'product' | 'general' | 'personal'
type CategoriaMeta = 'empresa' | 'produto' | 'geral' | 'pessoal'

const CATEGORIA_API_TO_UI: Record<ApiGoalCategory, CategoriaMeta> = {
  company: 'empresa',
  product: 'produto',
  general: 'geral',
  personal: 'pessoal',
}

const CATEGORIA_UI_TO_API: Record<CategoriaMeta, ApiGoalCategory> = {
  empresa: 'company',
  produto: 'product',
  geral: 'general',
  pessoal: 'personal',
}

interface ApiGoal {
  id: string
  ownerUserId: string
  title: string
  description: string
  category: ApiGoalCategory
  dueDate: string | null
  companyId: string | null
  lifeArea: LifeAreaKey | null
  archived: boolean
  createdAt: string
  updatedAt: string
  aggregate?: ApiGoalAggregate
}

type GoalChildren = {
  projects: Array<{ id: string; name: string; archived: boolean }>
  tasks: Array<{ id: string; title: string; archived: boolean; done: boolean }>
}

function fromApi(g: ApiGoal): Meta {
  return {
    id: g.id,
    titulo: g.title,
    descricao: g.description ?? '',
    categoria: CATEGORIA_API_TO_UI[g.category] ?? 'geral',
    prazo: g.dueDate,
    company_id: g.companyId ?? null,
    area_vida: g.lifeArea ?? null,
    arquivada: g.archived,
    criada_em: g.createdAt,
    atualizada_em: g.updatedAt,
  }
}

interface CreatePayload {
  titulo: string
  descricao?: string
  categoria: CategoriaMeta
  prazo?: string | null
  company_id?: string | null
  area_vida?: LifeAreaKey | null
}

interface UpdatePayload {
  titulo?: string
  descricao?: string
  categoria?: CategoriaMeta
  prazo?: string | null
  company_id?: string | null
  area_vida?: LifeAreaKey | null
}

function toApiCreate(p: CreatePayload): Record<string, unknown> {
  return {
    title: p.titulo,
    description: p.descricao,
    category: CATEGORIA_UI_TO_API[p.categoria] ?? 'general',
    dueDate: p.prazo ?? null,
    companyId: p.company_id ?? null,
    lifeArea: p.area_vida ?? null,
  }
}

function toApiPatch(p: UpdatePayload): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (p.titulo !== undefined) out.title = p.titulo
  if (p.descricao !== undefined) out.description = p.descricao
  if (p.categoria !== undefined) out.category = CATEGORIA_UI_TO_API[p.categoria]
  if (p.prazo !== undefined) out.dueDate = p.prazo
  if (p.company_id !== undefined) out.companyId = p.company_id
  if (p.area_vida !== undefined) out.lifeArea = p.area_vida
  return out
}

// === Progresso (spec §10.4) ===

function progressoFromAggregate(a: ApiGoalAggregate): ProgressoMeta {
  const totalT = a.directTaskTotal
  const tarefasFeitas = a.directTaskDone
  const totalP = a.projectsTotal
  const projetosFeitos = a.projectsDone
  const total = totalT + a.projectTaskTotal
  const feitas = tarefasFeitas + a.projectTaskDone
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0
  return { feitas, total, totalT, tarefasFeitas, totalP, projetosFeitos, pct }
}

const PROGRESSO_VAZIO: ProgressoMeta = {
  feitas: 0,
  total: 0,
  totalT: 0,
  tarefasFeitas: 0,
  totalP: 0,
  projetosFeitos: 0,
  pct: 0,
}

// === Status (spec §10.4) ===
//
// `concluida` quando a meta tem ações e todas estão feitas; `vencida` quando
// `prazo` passou e ainda não está concluída; senão `ativa`.
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function statusMetaFromProgresso(
  m: Pick<Meta, 'prazo'>,
  progresso: ProgressoMeta,
): StatusMeta {
  if (progresso.total > 0 && progresso.feitas === progresso.total) return 'concluida'
  if (m.prazo && m.prazo < todayIso()) return 'vencida'
  return 'ativa'
}

// === Store ===

export const useMetasStore = defineStore('metas', () => {
  const list = ref<Meta[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const aggregates = ref<Record<string, ApiGoalAggregate>>({})
  const sessionNewIds = ref<Record<string, boolean>>({})

  const ativas = computed(() => list.value.filter((m) => !m.arquivada))

  function byId(id: string | null | undefined): Meta | undefined {
    if (!id) return undefined
    return list.value.find((m) => m.id === id)
  }

  function tituloPorId(id: string | null | undefined): string | null {
    return byId(id)?.titulo ?? null
  }

  function progressoMeta(id: string): ProgressoMeta {
    const agg = aggregates.value[id]
    return agg ? progressoFromAggregate(agg) : PROGRESSO_VAZIO
  }

  function statusMeta(m: Meta): StatusMeta {
    return statusMetaFromProgresso(m, progressoMeta(m.id))
  }

  function projetosVinculados(id: string): string[] {
    return aggregates.value[id]?.projectIds ?? []
  }

  async function refresh(opts: { includeArchived?: boolean } = {}): Promise<void> {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived) query.includeArchived = '1'
      const res = await $fetch<{ goals: ApiGoal[] }>('/api/goals', { query })
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      const pending: boolean = await hasPendingForEntity('goals')
      if (pending) return
      list.value = res.goals.map(fromApi)
      const aggMap: Record<string, ApiGoalAggregate> = {}
      for (const g of res.goals) {
        if (g.aggregate) aggMap[g.id] = g.aggregate
      }
      aggregates.value = aggMap
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar metas.'
    } finally {
      loading.value = false
    }
  }

  async function criar(payload: CreatePayload): Promise<Meta> {
    // Id gerado no cliente: o servidor o honra, evitando id "stale" pós-sync.
    const id = import.meta.client ? crypto.randomUUID() : undefined
    const body = id ? { ...toApiCreate(payload), id } : toApiCreate(payload)
    try {
      const row = await $fetch<ApiGoal>('/api/goals', { method: 'POST', body })
      const meta = fromApi(row)
      sessionNewIds.value[meta.id] = true
      list.value = [meta, ...list.value]
      return meta
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const now = new Date().toISOString()
      const optimistic: Meta = {
        id: id ?? `tmp-${now}`,
        titulo: payload.titulo,
        descricao: payload.descricao ?? '',
        categoria: payload.categoria,
        prazo: payload.prazo ?? null,
        company_id: payload.company_id ?? null,
        area_vida: payload.area_vida ?? null,
        arquivada: false,
        criada_em: now,
        atualizada_em: now,
      }
      sessionNewIds.value[optimistic.id] = true
      list.value = [optimistic, ...list.value]
      await queueRequest('goals', 'CREATE', 'POST', '/api/goals', body)
      return optimistic
    }
  }

  async function atualizar(id: string, payload: UpdatePayload): Promise<Meta> {
    const body = toApiPatch(payload)
    const idx = list.value.findIndex((m) => m.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    try {
      const row = await $fetch<ApiGoal>(`/api/goals/${id}`, { method: 'PATCH', body })
      const meta = fromApi(row)
      const i = list.value.findIndex((m) => m.id === id)
      if (i >= 0) list.value[i] = meta
      return meta
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const optimistic: Meta = {
        ...(prev as Meta),
        titulo: payload.titulo ?? prev?.titulo ?? '',
        descricao: payload.descricao ?? prev?.descricao ?? '',
        categoria: payload.categoria ?? prev?.categoria ?? 'geral',
        prazo: payload.prazo !== undefined ? payload.prazo : (prev?.prazo ?? null),
        company_id: payload.company_id !== undefined ? payload.company_id : (prev?.company_id ?? null),
        area_vida: payload.area_vida !== undefined ? payload.area_vida : (prev?.area_vida ?? null),
        atualizada_em: new Date().toISOString(),
      }
      if (idx >= 0) list.value[idx] = optimistic
      await queueRequest('goals', 'UPDATE', 'PATCH', `/api/goals/${id}`, body)
      return optimistic
    }
  }

  type CascadeIds = { projectIds?: string[]; taskIds?: string[] }

  async function listChildren(id: string): Promise<GoalChildren> {
    // Generic explícito força o overload não-tipado-por-rota do $fetch, evitando
    // o casamento contra a união gigante de rotas (estoura o limite do TS).
    return await $fetch<GoalChildren>(`/api/goals/${id}/children`)
  }

  async function arquivar(
    id: string,
    arquivada = true,
    cascade?: CascadeIds,
  ): Promise<void> {
    const idx = list.value.findIndex((m) => m.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, arquivada }
    const body = { archived: arquivada, cascade }
    try {
      await $fetch(`/api/goals/${id}/archive`, { method: 'POST', body })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('goals', 'UPDATE', 'POST', `/api/goals/${id}/archive`, body)
    }
  }

  async function deletar(id: string, cascade?: CascadeIds): Promise<void> {
    const prevList = list.value
    list.value = list.value.filter((m) => m.id !== id)
    const next = { ...aggregates.value }
    delete next[id]
    aggregates.value = next
    try {
      // await $fetch(`/api/goals/${id}`, {
      //   method: 'DELETE',
      //   body: cascade ? { cascade } : undefined,
      // })
      await $fetch(`/api/goals/${id}/archive`, { method: 'POST', body })
    } catch (e) {
      if (!isOfflineError(e)) {
        list.value = prevList
        throw e
      }
      // await queueRequest('goals', 'DELETE', 'DELETE', `/api/goals/${id}`, cascade ? { cascade } : undefined)
      await queueRequest('goals', 'UPDATE', 'POST', `/api/goals/${id}/archive`, body)
    }
  }

  return {
    // state
    list,
    loading,
    error,
    // getters
    ativas,
    byId,
    tituloPorId,
    progressoMeta,
    statusMeta,
    projetosVinculados,
    // actions
    refresh,
    criar,
    atualizar,
    arquivar,
    deletar,
    sessionNewIds,
  }
})

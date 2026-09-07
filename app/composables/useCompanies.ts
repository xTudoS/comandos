import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

export type CompanyCounts = {
  taskTotal: number
  taskOpen: number
  projectTotal: number
  goalTotal: number
}

export type Company = {
  id: string
  ownerUserId: string
  name: string
  archived: boolean
  createdAt: string
  updatedAt: string
  counts?: CompanyCounts
}

export function useCompanies() {
  const list = useState<Company[]>('companies:list', () => [])
  const loading = useState('companies:loading', () => false)
  const error = useState<string | null>('companies:error', () => null)

  async function refresh(opts: { includeArchived?: boolean; withCounts?: boolean } = {}) {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived) query.includeArchived = '1'
      if (opts.withCounts) query.withCounts = '1'
      const res = await $fetch<{ companies: Company[] }>('/api/companies', { query })
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('companies'))) list.value = res.companies
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar empresas.'
    } finally {
      loading.value = false
    }
  }

  /**
   * Idempotente: backend faz get-or-create por nome (case-insensitive).
   * Retorna a empresa criada/encontrada e atualiza a lista local.
   */
  async function create(name: string): Promise<Company> {
    // Id gerado no cliente e enviado ao servidor: vira a fonte da verdade, então
    // não há id "stale" depois do sync (PATCH/archive offline não dão mais 404).
    const id = import.meta.client ? crypto.randomUUID() : undefined
    const body = id ? { name, id } : { name }
    try {
      const row = await $fetch<Company>('/api/companies', { method: 'POST', body })
      const idx = list.value.findIndex((c) => c.id === row.id)
      if (idx >= 0) list.value[idx] = { ...list.value[idx]!, ...row }
      else list.value = [...list.value, row].sort((a, b) => a.name.localeCompare(b.name, 'pt'))
      return row
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const now = new Date().toISOString()
      const optimistic: Company = {
        id: id ?? `tmp-${now}`,
        ownerUserId: '',
        name,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }
      list.value = [...list.value, optimistic].sort((a, b) => a.name.localeCompare(b.name, 'pt'))
      await queueRequest('companies', 'CREATE', 'POST', '/api/companies', body)
      return optimistic
    }
  }

  async function update(id: string, patch: { name?: string }): Promise<Company> {
    const idx = list.value.findIndex((c) => c.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, ...patch }
    try {
      const row = await $fetch<Company>(`/api/companies/${id}`, { method: 'PATCH', body: patch })
      const i = list.value.findIndex((c) => c.id === id)
      if (i >= 0) list.value[i] = { ...list.value[i]!, ...row }
      return row
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('companies', 'UPDATE', 'PATCH', `/api/companies/${id}`, patch)
      return list.value[idx] as Company
    }
  }

  async function archive(id: string, archived = true) {
    const idx = list.value.findIndex((c) => c.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, archived }
    try {
      await $fetch(`/api/companies/${id}/archive`, { method: 'POST', body: { archived } })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('companies', 'UPDATE', 'POST', `/api/companies/${id}/archive`, { archived })
    }
  }

  async function remove(id: string) {
    const idx = list.value.findIndex((c) => c.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value = list.value.filter((c) => c.id !== id)
    try {
      await $fetch(`/api/companies/${id}`, { method: 'DELETE' })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (prev) list.value = [prev, ...list.value]
        throw e
      }
      await queueRequest('companies', 'DELETE', 'DELETE', `/api/companies/${id}`)
    }
  }

  function byId(id: string | null | undefined): Company | undefined {
    if (!id) return undefined
    return list.value.find((c) => c.id === id)
  }

  return { list, loading, error, refresh, create, update, archive, remove, byId }
}

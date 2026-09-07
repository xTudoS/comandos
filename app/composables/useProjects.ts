import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

export type ProjectCategory = 'company' | 'product' | 'general' | 'personal'

export type Project = {
  id: string
  ownerUserId: string
  name: string
  category: ProjectCategory
  parentProjectId: string | null
  notes: string
  archived: boolean
  createdAt: string
  updatedAt: string
  openTaskCount: number
}

export type CreateProjectInput = {
  name: string
  category?: ProjectCategory
  parentProjectId?: string | null
  notes?: string
}

export type UpdateProjectPatch = Partial<
  Pick<Project, 'name' | 'category' | 'parentProjectId' | 'notes'>
>

export function useProjects() {
  const list = useState<Project[]>('projects:list', () => [])
  const loading = useState('projects:loading', () => false)
  const error = useState<string | null>('projects:error', () => null)

  async function refresh(opts: { includeArchived?: boolean } = {}) {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived) query.includeArchived = '1'
      const res = await $fetch<{ projects: Project[] }>('/api/projects', { query })
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('projects'))) list.value = res.projects
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar projetos.'
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateProjectInput): Promise<Project | null> {
    // Id gerado no cliente e enviado ao servidor: vira a fonte da verdade, então
    // não há id "stale" depois do sync (PATCH/archive offline não dão mais 404).
    const id = import.meta.client ? crypto.randomUUID() : undefined
    const body = id ? { ...input, id } : input
    try {
      const row = await $fetch<Project>('/api/projects', { method: 'POST', body })
      await refresh()
      return row
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const now = new Date().toISOString()
      const optimistic: Project = {
        id: id ?? `tmp-${now}`,
        ownerUserId: '',
        name: input.name,
        category: input.category ?? 'general',
        parentProjectId: input.parentProjectId ?? null,
        notes: input.notes ?? '',
        archived: false,
        createdAt: now,
        updatedAt: now,
        openTaskCount: 0,
      }
      list.value = [optimistic, ...list.value]
      await queueRequest('projects', 'CREATE', 'POST', '/api/projects', body)
      return optimistic
    }
  }

  async function update(id: string, patch: UpdateProjectPatch) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, ...patch }
    try {
      await $fetch(`/api/projects/${id}`, { method: 'PATCH', body: patch })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('projects', 'UPDATE', 'PATCH', `/api/projects/${id}`, patch)
    }
  }

  async function archive(id: string, archived = true) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, archived }
    try {
      await $fetch(`/api/projects/${id}/archive`, { method: 'POST', body: { archived } })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('projects', 'UPDATE', 'POST', `/api/projects/${id}/archive`, { archived })
    }
  }

  async function remove(id: string) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value = list.value.filter((p) => p.id !== id)
    try {
      await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (prev) list.value = [prev, ...list.value]
        throw e
      }
      await queueRequest('projects', 'DELETE', 'DELETE', `/api/projects/${id}`)
    }
  }

  return { list, loading, error, refresh, create, update, archive, remove }
}

import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

export type Person = {
  id: string
  ownerUserId: string
  name: string
  email: string | null
  linkedUserId: string | null
  isAssistant: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

export function usePeople() {
  const list = useState<Person[]>('people:list', () => [])
  const loading = useState('people:loading', () => false)
  const error = useState<string | null>('people:error', () => null)

  async function refresh() {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ people: Person[] }>('/api/people')
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('people'))) list.value = res.people
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar pessoas.'
    } finally {
      loading.value = false
    }
  }

  async function create(args: { name: string; email?: string | null }) {
    // Id gerado no cliente e enviado ao servidor: vira a fonte da verdade, então
    // não há id "stale" depois do sync (PATCH offline não dá mais 404).
    const id = import.meta.client ? crypto.randomUUID() : undefined
    const base = { name: args.name, email: args.email ?? null }
    const body = id ? { ...base, id } : base
    try {
      await $fetch('/api/people', { method: 'POST', body })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const now = new Date().toISOString()
      const optimistic: Person = {
        id: id ?? `tmp-${now}`,
        ownerUserId: '',
        name: args.name,
        email: args.email ?? null,
        linkedUserId: null,
        isAssistant: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }
      list.value = [...list.value, optimistic]
      await queueRequest('people', 'CREATE', 'POST', '/api/people', body)
    }
  }

  async function update(id: string, patch: { name?: string; email?: string | null }) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, ...patch }
    try {
      await $fetch(`/api/people/${id}`, { method: 'PATCH', body: patch })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('people', 'UPDATE', 'PATCH', `/api/people/${id}`, patch)
    }
  }

  async function invite(id: string, email: string) {
    try {
      await $fetch(`/api/people/${id}/invite`, { method: 'POST', body: { email } })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) throw e
      await queueRequest('people', 'UPDATE', 'POST', `/api/people/${id}/invite`, { email })
    }
  }

  async function setAssistant(id: string) {
    const prevList = list.value
    list.value = list.value.map((p) => ({ ...p, isAssistant: p.id === id }))
    try {
      await $fetch(`/api/people/${id}/assistant`, { method: 'POST' })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        list.value = prevList
        throw e
      }
      await queueRequest('people', 'UPDATE', 'POST', `/api/people/${id}/assistant`)
    }
  }

  async function archive(id: string) {
    const prevList = list.value
    list.value = list.value.filter((p) => p.id !== id)
    try {
      await $fetch(`/api/people/${id}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        list.value = prevList
        throw e
      }
      await queueRequest('people', 'DELETE', 'DELETE', `/api/people/${id}`)
    }
  }

  return { list, loading, error, refresh, create, update, invite, setAssistant, archive }
}

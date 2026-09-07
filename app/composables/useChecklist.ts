export type ChecklistItem = {
  id: string
  taskId: string
  text: string
  done: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export function useChecklist(taskId: Ref<string | null>) {
  const items = ref<ChecklistItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    if (!taskId.value) {
      items.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ items: ChecklistItem[] }>(
        `/api/tasks/${taskId.value}/checklist`,
      )
      items.value = res.items
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar checklist.'
    } finally {
      loading.value = false
    }
  }

  async function add(text: string) {
    if (!taskId.value) return
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: ChecklistItem = {
      id: tmpId,
      taskId: taskId.value ?? '',
      text,
      done: false,
      position: items.value.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    items.value = [...items.value, optimistic]
    // Tarefa ainda não existe (tela de criação): mantém só no buffer local.
    // flush() persiste tudo assim que a tarefa for criada.
    if (!taskId.value) return
    try {
      const serverRow = await $fetch<ChecklistItem>(`/api/tasks/${taskId.value}/checklist`, {
        method: 'POST',
        body: { text },
      })
      const idx = items.value.findIndex(i => i.id === tmpId)
      if (idx >= 0) {
        items.value[idx] = serverRow
      }
    } catch (e) {
      items.value = items.value.filter(i => i.id !== tmpId)
      throw e
    }
  }

  async function toggle(id: string, done: boolean) {
    const idx = items.value.findIndex(i => i.id === id)
    const prev = idx >= 0 ? items.value[idx]!.done : null
    if (idx >= 0) items.value[idx]!.done = done
    if (!taskId.value) return // buffer local: só estado em memória até o flush()
    try {
      const serverRow = await $fetch<ChecklistItem>(`/api/tasks/${taskId.value}/checklist/${id}`, {
        method: 'PATCH',
        body: { done },
      })
      const currentIdx = items.value.findIndex(i => i.id === id)
      if (currentIdx >= 0) items.value[currentIdx] = serverRow
    } catch (e) {
      const currentIdx = items.value.findIndex(i => i.id === id)
      if (currentIdx >= 0 && prev !== null) items.value[currentIdx]!.done = prev
      throw e
    }
  }

  async function rename(id: string, text: string) {
    const idx = items.value.findIndex(i => i.id === id)
    const prev = idx >= 0 ? items.value[idx]!.text : null
    if (idx >= 0) items.value[idx]!.text = text
    if (!taskId.value) return // buffer local
    try {
      const serverRow = await $fetch<ChecklistItem>(`/api/tasks/${taskId.value}/checklist/${id}`, {
        method: 'PATCH',
        body: { text },
      })
      const currentIdx = items.value.findIndex(i => i.id === id)
      if (currentIdx >= 0) items.value[currentIdx] = serverRow
    } catch (e) {
      const currentIdx = items.value.findIndex(i => i.id === id)
      if (currentIdx >= 0 && prev !== null) items.value[currentIdx]!.text = prev
      throw e
    }
  }

  async function remove(id: string) {
    const idx = items.value.findIndex(i => i.id === id)
    const prev = idx >= 0 ? items.value[idx] : null
    if (idx >= 0) items.value = items.value.filter(i => i.id !== id)
    if (!taskId.value) return // buffer local
    try {
      await $fetch(`/api/tasks/${taskId.value}/checklist/${id}`, { method: 'DELETE' })
    } catch (e) {
      if (prev) {
        items.value = [...items.value, prev].sort((a, b) => a.position - b.position)
      }
      throw e
    }
  }

  // Persiste no servidor os itens que foram adicionados no buffer local (antes de a
  // tarefa existir), na ordem em que aparecem. Best-effort: uma falha num item não
  // impede os demais nem o salvamento da tarefa. Chamado pelo TaskModal logo após
  // criar a tarefa, com o id recém-gerado.
  async function flush(realTaskId: string) {
    const buffered = items.value.filter((i) => i.id.startsWith('tmp-'))
    for (const it of buffered) {
      try {
        const row = await $fetch<ChecklistItem>(`/api/tasks/${realTaskId}/checklist`, {
          method: 'POST',
          body: { text: it.text },
        })
        if (it.done) {
          await $fetch(`/api/tasks/${realTaskId}/checklist/${row.id}`, {
            method: 'PATCH',
            body: { done: true },
          })
        }
      } catch {
        // best-effort
      }
    }
  }

  watch(taskId, () => void refresh(), { immediate: true })

  return { items, loading, error, refresh, add, toggle, rename, remove, flush }
}

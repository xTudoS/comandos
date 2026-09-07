export type Annotation = {
  id: string
  taskId: string
  authorUserId: string
  authorName: string | null
  body: string
  createdAt: string
}

export function useAnnotations(taskId: Ref<string | null>) {
  const list = ref<Annotation[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    if (!taskId.value) {
      list.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ annotations: Annotation[] }>(
        `/api/tasks/${taskId.value}/annotations`,
      )
      list.value = res.annotations
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar anotações.'
    } finally {
      loading.value = false
    }
  }

  async function add(body: string) {
    if (!taskId.value) return
    await $fetch(`/api/tasks/${taskId.value}/annotations`, {
      method: 'POST',
      body: { body },
    })
    await refresh()
  }

  async function remove(id: string) {
    if (!taskId.value) return
    await $fetch(`/api/tasks/${taskId.value}/annotations/${id}`, { method: 'DELETE' })
    await refresh()
  }

  watch(taskId, () => void refresh(), { immediate: true })

  return { list, loading, error, refresh, add, remove }
}

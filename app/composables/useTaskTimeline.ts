export type TimelineEntry = {
  id: string
  entityType: 'task' | 'checklist_item' | 'task_annotation' | string
  entityId: string
  action: string
  actorUserId: string | null
  actorName: string | null
  changes: Record<string, unknown> | null
  context: Record<string, unknown> | null
  at: string
}

export function useTaskTimeline(taskId: Ref<string | null>) {
  const entries = ref<TimelineEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    if (!taskId.value) {
      entries.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ entries: TimelineEntry[] }>(
        `/api/tasks/${taskId.value}/timeline`,
      )
      entries.value = res.entries
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar histórico.'
    } finally {
      loading.value = false
    }
  }

  watch(taskId, () => void refresh(), { immediate: true })

  return { entries, loading, error, refresh }
}

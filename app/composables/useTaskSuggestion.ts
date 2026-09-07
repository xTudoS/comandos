/**
 * Sugestão da IA para os campos de uma tarefa.
 *
 * ⚠️ Isto NUNCA entra no caminho de criação. A tarefa nasce com id do cliente e
 * vai para a outbox; a captura rápida precisa continuar instantânea e funcionar
 * offline. `classify()` é chamado DEPOIS que o create liquidou, e falhar aqui
 * não pode ter consequência nenhuma sobre a tarefa.
 */
export type SuggestionFields = {
  horizon?: string
  type?: string
  isMicro?: boolean
  lifeArea?: string
  companyId?: string
  projectId?: string
  goalId?: string
  delegatePersonId?: string
  scheduledDate?: string
  scheduledTime?: string
  durationMinutes?: number
}

export type SuggestionQuestion = {
  field: string
  question: string
  options: string[]
}

export type TaskSuggestion = {
  fields: SuggestionFields
  questions: SuggestionQuestion[]
  reasoning?: string
}

export function useTaskSuggestion() {
  const suggestion = ref<TaskSuggestion | null>(null)
  const loading = ref(false)
  const error = ref('')

  function reset() {
    suggestion.value = null
    error.value = ''
    loading.value = false
  }

  async function classify(taskId: string) {
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      suggestion.value = await $fetch<TaskSuggestion>(`/api/tasks/${taskId}/classify`, {
        method: 'POST',
      })
    } catch (e: unknown) {
      // Offline, sem provedor configurado, cota estourada — todos caem aqui, e
      // nenhum deles é motivo para atrapalhar quem só quer criar a tarefa.
      error.value =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ??
        'Não consegui sugerir agora.'
      suggestion.value = null
    } finally {
      loading.value = false
    }
  }

  /** true quando há de fato algo a oferecer. */
  const hasSomething = computed(() => {
    const s = suggestion.value
    if (!s) return false
    return Object.keys(s.fields).length > 0 || s.questions.length > 0
  })

  return { suggestion, loading, error, hasSomething, classify, reset }
}

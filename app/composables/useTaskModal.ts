import type { Task } from '~/composables/useTasks'
import type { HorizonDb } from '~/utils/horizontes'

/** Campos pré-preenchidos ao abrir o modal para uma tarefa nova (ex.: o "+" de
 * uma coluna do board já cria no horizonte daquela coluna). */
export type TaskModalPreset = {
  horizon?: HorizonDb
  isMicro?: boolean
  scheduledDate?: string
  type?: Task['type']
}

type State = { open: boolean; editing: Task | null; preset: TaskModalPreset | null }

export function useTaskModal() {
  const state = useState<State>('task-modal', () => ({ open: false, editing: null, preset: null }))

  function openNew(preset: TaskModalPreset | null = null) {
    state.value = { open: true, editing: null, preset }
  }

  function openEdit(task: Task) {
    state.value = { open: true, editing: task, preset: null }
  }

  function close() {
    state.value = { open: false, editing: null, preset: null }
  }

  return { state, openNew, openEdit, close }
}

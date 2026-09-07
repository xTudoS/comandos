<script setup lang="ts">
// /quadros/[id] — quadro customizado do usuário.
//
// Os cards são magros (taskId + coluna + posição): a tarefa em si sai da lista
// global de useTasks. Isso funciona porque ser membro do quadro dá acesso à
// tarefa, então /api/tasks já devolve as tarefas dos quadros compartilhados.

import type { Task } from '~/composables/useTasks'
import type { BoardDrop } from '~/utils/boardDrop'
import { useToast } from '~/composables/useToast'
import { useConfirm } from '~/composables/useConfirm'

const route = useRoute()
const router = useRouter()
const boardId = computed(() => String(route.params.id))

const {
  board,
  columns,
  cards,
  members,
  loading,
  error,
  isShared,
  refresh,
  moveCard,
  addExistingTask,
  createTaskInColumn,
  removeCard,
  addColumn,
  renameColumn,
  deleteColumn,
  reorderBoardColumns,
} = useBoard(boardId.value)

const { list: tasks, refresh: refreshTasks } = useTasks()
const { refresh: refreshBoards } = useBoards()
const { openEdit } = useTaskModal()
const { show: toast } = useToast()
const { ask: askConfirm } = useConfirm()

// Mostrar concluídas fica desligado por padrão, igual a /trabalho.
const showCompleted = ref(false)

// Carrega quadro e tarefas em paralelo: um card cujo taskId ainda não chegou na
// lista global não renderiza, então esperar só o quadro daria "quadro vazio".
loading.value = true
onMounted(() => {
  Promise.all([load(), refreshTasks()]).catch(() => {})
})

async function load() {
  try {
    await refresh()
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode
    if (status === 404) {
      toast('Quadro não encontrado.')
      await refreshBoards()
      await router.replace('/quadros')
    }
  }
}

// Recarrega ao trocar de quadro sem sair da rota (navegação pela sidebar).
watch(boardId, () => {
  load()
})

const tasksById = computed(() => new Map(tasks.value.map((t) => [t.id, t])))

/** Tarefas de cada coluna, na ordem das posições dos cards. */
const tasksByColumn = computed<Record<string, Task[]>>(() => {
  const out: Record<string, Task[]> = {}
  for (const col of columns.value) out[col.id] = []
  for (const card of [...cards.value].sort((a, b) => a.position - b.position)) {
    const task = tasksById.value.get(card.taskId)
    // Card sem tarefa carregada ainda: some até o refresh trazer a linha.
    if (!task) continue
    if (task.done && !showCompleted.value) continue
    ;(out[card.columnId] ??= []).push(task)
  }
  return out
})

const existingTaskIds = computed(() => cards.value.map((c) => c.taskId))

const totalCards = computed(() => cards.value.length)

// ── Aviso de compartilhamento ──
// Colocar uma tarefa num quadro com membros É compartilhar a tarefa. Avisa uma
// vez por sessão e por quadro, nomeando quem passa a enxergar.
const warnedBoards = useState<Record<string, boolean>>('boards:shareWarned', () => ({}))

function warnIfShared() {
  if (!isShared.value || warnedBoards.value[boardId.value]) return
  warnedBoards.value[boardId.value] = true
  const names = members.value.map((m) => m.name).join(', ')
  toast(`Este quadro é compartilhado — ${names} passam a enxergar esta tarefa.`, 4200)
}

async function onDrop(drop: BoardDrop) {
  try {
    await moveCard(drop.taskId, drop.toColumnId, drop.toIndex)
  } catch {
    toast('Não foi possível mover o card.')
  }
}

async function onCreateTask(payload: { columnId: string; title: string }) {
  warnIfShared()
  try {
    await createTaskInColumn({ title: payload.title }, payload.columnId)
  } catch {
    toast('Não foi possível criar a tarefa.')
  }
}

async function onPickTask(payload: { columnId: string; taskId: string }) {
  warnIfShared()
  try {
    await addExistingTask(payload.taskId, payload.columnId)
  } catch {
    toast('Não foi possível adicionar a tarefa.')
  }
}

function onRemoveCard(taskId: string) {
  const message = isShared.value
    ? 'Remover do quadro? Os membros deixam de enxergar esta tarefa. A tarefa continua existindo.'
    : 'Remover a tarefa deste quadro? Ela continua existindo.'
  askConfirm(message, async () => {
    try {
      await removeCard(taskId)
    } catch {
      toast('Não foi possível remover o card.')
    }
  })
}

function onDeleteColumn(columnId: string) {
  const col = columns.value.find((c) => c.id === columnId)
  const count = (tasksByColumn.value[columnId] ?? []).length
  const message = count
    ? `Apagar a coluna "${col?.name}"? Os ${count} cards vão para a primeira coluna.`
    : `Apagar a coluna "${col?.name}"?`
  askConfirm(message, async () => {
    try {
      await deleteColumn(columnId)
    } catch (e) {
      toast((e as Error)?.message ?? 'Não foi possível apagar a coluna.')
    }
  })
}

async function onRenameColumn(payload: { columnId: string; name: string }) {
  try {
    await renameColumn(payload.columnId, payload.name)
  } catch {
    toast('Não foi possível renomear a coluna.')
  }
}

async function onAddColumn(name: string) {
  try {
    await addColumn(name)
  } catch {
    toast('Não foi possível criar a coluna.')
  }
}

async function onReorderColumns(ids: string[]) {
  try {
    await reorderBoardColumns(ids)
  } catch {
    toast('Não foi possível reordenar as colunas.')
  }
}

const settingsOpen = ref(false)
</script>

<template>
  <div class="quadro-wrap">
    <PageHeader :title="board?.name ?? 'Quadro'">
      <template #actions>
        <span v-if="isShared" class="q-shared" title="Quadro compartilhado">
          <BaseIcon name="users" :size="13" />
          Compartilhado
        </span>
        <button
          type="button"
          class="q-tool"
          :class="{ active: showCompleted }"
          :aria-pressed="showCompleted"
          @click="showCompleted = !showCompleted"
        >
          <BaseIcon name="check-check" :size="15" />
          Concluídas
        </button>
        <button type="button" class="q-tool" @click="settingsOpen = true">
          <BaseIcon name="settings" :size="15" />
          Configurações
        </button>
      </template>
    </PageHeader>

    <p v-if="loading && !columns.length" class="q-state">Carregando…</p>
    <p v-else-if="error" class="q-state">{{ error }}</p>

    <QuadroBoard
      v-else
      :board-id="boardId"
      :columns="columns"
      :tasks-by-column="tasksByColumn"
      :existing-task-ids="existingTaskIds"
      @drop="onDrop"
      @open-task="openEdit"
      @create-task="onCreateTask"
      @pick-task="onPickTask"
      @remove-card="onRemoveCard"
      @rename-column="onRenameColumn"
      @delete-column="onDeleteColumn"
      @reorder-columns="onReorderColumns"
      @add-column="onAddColumn"
    />

    <p v-if="!loading && !totalCards" class="q-hint">
      Quadro vazio. Use o "+" de uma coluna para criar uma tarefa nova ou trazer
      uma que já existe.
    </p>

    <QuadroSettingsModal
      v-if="settingsOpen"
      :board-id="boardId"
      @close="settingsOpen = false"
    />
  </div>
</template>

<style scoped>
.quadro-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 32px;
  min-height: 0;
}
.q-shared {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}
.q-tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.q-tool:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.q-tool.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
.q-state,
.q-hint {
  font-size: 13px;
  color: var(--text-4);
}
</style>

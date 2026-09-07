<script setup lang="ts">
import Sortable from 'sortablejs'
import type { Task } from '~/composables/useTasks'
import type { BoardColumn } from '~/composables/useBoard'
import type { BoardDrop } from '~/utils/boardDrop'
import { revertSortableMove } from '~/utils/sortableDom'

const props = defineProps<{
  boardId: string
  columns: BoardColumn[]
  /** Tarefas de cada coluna, já na ordem. */
  tasksByColumn: Record<string, Task[]>
  existingTaskIds: string[]
}>()

const emit = defineEmits<{
  drop: [BoardDrop]
  'open-task': [Task]
  'create-task': [{ columnId: string; title: string }]
  'pick-task': [{ columnId: string; taskId: string }]
  'remove-card': [string]
  'rename-column': [{ columnId: string; name: string }]
  'delete-column': [string]
  'reorder-columns': [string[]]
  'add-column': [string]
}>()

// Um grupo por quadro: dois quadros abertos em abas diferentes não devem
// aceitar cards um do outro.
const group = computed(() => `quadro-${props.boardId}`)

const stripEl = ref<HTMLElement>()
let sortable: Sortable | null = null

onMounted(() => {
  if (!stripEl.value) return
  sortable = Sortable.create(stripEl.value, {
    animation: 140,
    // Handle no header: sem isso, arrastar um card também arrastaria a coluna.
    handle: '.qcol-head',
    draggable: '.qcol',
    onEnd(evt) {
      const from = evt.oldIndex
      const to = evt.newIndex
      revertSortableMove(evt)
      if (from == null || to == null || from === to) return
      const ids = props.columns.map((c) => c.id)
      const [moved] = ids.splice(from, 1)
      if (!moved) return
      ids.splice(to, 0, moved)
      emit('reorder-columns', ids)
    },
  })
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})

const addingColumn = ref(false)
const newColumnName = ref('')
const newColumnInput = ref<HTMLInputElement>()

async function startAddColumn() {
  addingColumn.value = true
  newColumnName.value = ''
  await nextTick()
  newColumnInput.value?.focus()
}

function commitAddColumn() {
  const name = newColumnName.value.trim()
  addingColumn.value = false
  if (!name) return
  emit('add-column', name)
}
</script>

<template>
  <div class="qboard">
    <div ref="stripEl" class="qboard-strip">
      <QuadroColumn
        v-for="col in columns"
        :key="col.id"
        :column="col"
        :tasks="tasksByColumn[col.id] ?? []"
        :group="group"
        :existing-task-ids="existingTaskIds"
        :can-delete-column="columns.length > 1"
        @drop="emit('drop', $event)"
        @open-task="emit('open-task', $event)"
        @create-task="emit('create-task', $event)"
        @pick-task="emit('pick-task', $event)"
        @remove-card="emit('remove-card', $event)"
        @rename="emit('rename-column', $event)"
        @delete-column="emit('delete-column', $event)"
      />
    </div>

    <div class="qboard-addcol">
      <input
        v-if="addingColumn"
        ref="newColumnInput"
        v-model="newColumnName"
        class="qboard-colinput"
        type="text"
        placeholder="Nome da coluna"
        @blur="commitAddColumn"
        @keydown.enter.prevent="commitAddColumn"
        @keydown.esc="addingColumn = false"
      >
      <button v-else type="button" class="qboard-colbtn" @click="startAddColumn">
        <BaseIcon name="plus" :size="15" />
        Nova coluna
      </button>
    </div>
  </div>
</template>

<style scoped>
.qboard {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.qboard-strip {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}
.qboard-addcol {
  flex: 0 0 220px;
  padding-top: 4px;
}
.qboard-colbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  width: 100%;
  font-size: 13px;
  color: var(--text-3);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-md);
}
.qboard-colbtn:hover {
  color: var(--text);
  background: var(--surface-hover);
}
.qboard-colinput {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
}
</style>

<script setup lang="ts">
import Sortable from 'sortablejs'
import type { Task } from '~/composables/useTasks'
import type { BoardColumn } from '~/composables/useBoard'
import { boardDropFromEvent, type BoardDrop } from '~/utils/boardDrop'
import { revertSortableMove } from '~/utils/sortableDom'

const props = defineProps<{
  column: BoardColumn
  tasks: Task[]
  /** Grupo do Sortable: um por quadro, para não arrastar entre quadros abertos. */
  group: string
  existingTaskIds: string[]
  canDeleteColumn: boolean
}>()

const emit = defineEmits<{
  drop: [BoardDrop]
  'open-task': [Task]
  'create-task': [{ columnId: string; title: string }]
  'pick-task': [{ columnId: string; taskId: string }]
  'remove-card': [string]
  rename: [{ columnId: string; name: string }]
  'delete-column': [string]
}>()

const bodyEl = ref<HTMLElement>()
let sortable: Sortable | null = null

onMounted(() => {
  if (!bodyEl.value) return
  sortable = Sortable.create(bodyEl.value, {
    group: props.group,
    // Diferente do board de horizontes: aqui a posição é dado real, então
    // reordenar DENTRO da coluna persiste.
    sort: true,
    animation: 140,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    onEnd(evt) {
      // Lê o destino ANTES de desfazer o movimento de DOM.
      const drop = boardDropFromEvent(evt)
      // O Vue é o dono do DOM: devolve o nó e deixa a re-renderização pintar a
      // posição nova a partir dos dados. Sem isso o DOM diverge da árvore de
      // vnodes e o card mexido para de responder aos movimentos seguintes —
      // ver o comentário em app/components/quadros/BoardColumn.vue.
      revertSortableMove(evt)
      if (drop) emit('drop', drop)
    },
  })
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})

const openCount = computed(() => props.tasks.filter((t) => !t.done).length)

const adding = ref(false)
const renaming = ref(false)
const draftName = ref(props.column.name)

async function startRename() {
  draftName.value = props.column.name
  renaming.value = true
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

const renameInput = ref<HTMLInputElement>()

function commitRename() {
  const name = draftName.value.trim()
  renaming.value = false
  if (!name || name === props.column.name) return
  emit('rename', { columnId: props.column.id, name })
}
</script>

<template>
  <section class="qcol">
    <header class="qcol-head">
      <div class="qcol-title">
        <input
          v-if="renaming"
          ref="renameInput"
          v-model="draftName"
          class="qcol-rename"
          type="text"
          @blur="commitRename"
          @keydown.enter.prevent="commitRename"
          @keydown.esc="renaming = false"
        >
        <template v-else>
          <button type="button" class="qcol-name" @click="startRename">
            {{ column.name }}
          </button>
          <span class="qcol-count">{{ openCount }}</span>
        </template>
      </div>
      <div class="qcol-tools">
        <button
          type="button"
          class="qcol-btn"
          aria-label="Adicionar tarefa"
          @click="adding = true"
        >
          <BaseIcon name="plus" :size="15" />
        </button>
        <button
          v-if="canDeleteColumn"
          type="button"
          class="qcol-btn"
          aria-label="Apagar coluna"
          title="Apagar coluna (os cards vão para a primeira coluna)"
          @click="emit('delete-column', column.id)"
        >
          <BaseIcon name="trash-2" :size="15" />
        </button>
      </div>
    </header>

    <QuadroCardAdd
      v-if="adding"
      :existing-task-ids="existingTaskIds"
      @create="emit('create-task', { columnId: column.id, title: $event })"
      @pick="emit('pick-task', { columnId: column.id, taskId: $event })"
      @cancel="adding = false"
    />

    <div
      ref="bodyEl"
      class="qcol-body"
      :class="{ empty: tasks.length === 0 }"
      :data-column-id="column.id"
    >
      <BoardCard
        v-for="t in tasks"
        :key="t.id"
        :task="t"
        removable
        :hide-board-id="column.boardId"
        @open="emit('open-task', $event)"
        @remove="emit('remove-card', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.qcol {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  width: 300px;
  flex: 0 0 300px;
}
.qcol-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 2px;
}
.qcol-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.qcol-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
}
.qcol-name:hover {
  background: var(--surface-hover);
}
.qcol-rename {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  width: 170px;
}
.qcol-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
.qcol-tools {
  display: flex;
  align-items: center;
  gap: 1px;
}
.qcol-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.qcol-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.qcol-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
  padding: 2px;
  flex: 1;
}
.qcol-body.empty {
  justify-content: flex-start;
  padding: 0;
}
.qcol-body.empty::before {
  content: 'Arraste tarefas aqui';
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-4);
  font-size: 12px;
}
.qcol-body :deep(.drag-ghost) {
  opacity: 0.4;
}
.qcol-body :deep(.drag-chosen) {
  box-shadow: var(--shadow-lg);
}
</style>

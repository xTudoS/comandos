<script setup lang="ts">
import type { Task } from '~/composables/useTasks'

// Entrada de card na coluna, em dois modos: criar tarefa nova (título direto,
// fluxo Trello) ou buscar uma que já existe. O seletor de existentes filtra as
// tarefas que já estão no quadro — recolocar a mesma tarefa não faria nada.
const props = defineProps<{ existingTaskIds: string[] }>()
const emit = defineEmits<{
  create: [string]
  pick: [string]
  cancel: []
}>()

const mode = ref<'new' | 'existing'>('new')
const title = ref('')
const query = ref('')
const inputEl = ref<HTMLInputElement | HTMLElement>()

const { list: tasks } = useTasks()

const candidates = computed(() => {
  const inBoard = new Set(props.existingTaskIds)
  const q = query.value.trim().toLowerCase()
  return tasks.value
    .filter((t) => !t.archived && !t.done && !inBoard.has(t.id))
    .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
    .slice(0, 8)
})

onMounted(() => {
  ;(inputEl.value as HTMLInputElement | undefined)?.focus?.()
})

function submitNew() {
  const value = title.value.trim()
  if (!value) return
  emit('create', value)
  // Mantém o campo aberto: adicionar várias tarefas seguidas é o caso comum.
  title.value = ''
}

function onPick(task: Task) {
  emit('pick', task.id)
  query.value = ''
}

async function switchMode(next: 'new' | 'existing') {
  mode.value = next
  await nextTick()
  ;(inputEl.value as HTMLInputElement | undefined)?.focus?.()
}
</script>

<template>
  <div class="qca">
    <div class="qca-modes">
      <button
        type="button"
        class="qca-mode"
        :class="{ active: mode === 'new' }"
        @click="switchMode('new')"
      >
        Nova tarefa
      </button>
      <button
        type="button"
        class="qca-mode"
        :class="{ active: mode === 'existing' }"
        @click="switchMode('existing')"
      >
        Tarefa existente
      </button>
    </div>

    <input
      v-if="mode === 'new'"
      ref="inputEl"
      v-model="title"
      class="qca-input"
      type="text"
      placeholder="Título da tarefa"
      @keydown.enter.prevent="submitNew"
      @keydown.esc="emit('cancel')"
    >
    <template v-else>
      <input
        ref="inputEl"
        v-model="query"
        class="qca-input"
        type="text"
        placeholder="Buscar tarefa…"
        @keydown.esc="emit('cancel')"
      >
      <ul v-if="candidates.length" class="qca-list">
        <li v-for="t in candidates" :key="t.id">
          <button type="button" class="qca-item" @click="onPick(t)">
            {{ t.title }}
          </button>
        </li>
      </ul>
      <p v-else class="qca-empty">Nenhuma tarefa encontrada.</p>
    </template>

    <div class="qca-actions">
      <button v-if="mode === 'new'" type="button" class="qca-add" @click="submitNew">
        Adicionar
      </button>
      <button type="button" class="qca-cancel" @click="emit('cancel')">Cancelar</button>
    </div>
  </div>
</template>

<style scoped>
.qca {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.qca-modes {
  display: inline-flex;
  gap: 2px;
}
.qca-mode {
  flex: 1;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.qca-mode.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
.qca-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
}
.qca-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
}
.qca-item {
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  font-size: 13px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.qca-item:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.qca-empty {
  font-size: 12px;
  color: var(--text-4);
}
.qca-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.qca-add {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
}
.qca-cancel {
  padding: 6px 10px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.qca-cancel:hover {
  background: var(--surface-hover);
  color: var(--text);
}
</style>

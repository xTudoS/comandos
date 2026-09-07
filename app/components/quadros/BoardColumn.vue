<script setup lang="ts">
import Sortable from 'sortablejs'
import type { Task } from '~/composables/useTasks'
import { compareAz, compareByDue } from '~/utils/taskSort'
import { revertSortableMove } from '~/utils/sortableDom'

const props = defineProps<{
  horizonte: { id: string; label: string; desc: string }
  tasks: Task[]
  icon?: string
}>()
const emit = defineEmits<{
  'drop-task': [id: string]
  'open-task': [task: Task]
  add: [string]
}>()

const bodyEl = ref<HTMLElement>()
let sortable: Sortable | null = null

onMounted(() => {
  if (!bodyEl.value) return
  sortable = Sortable.create(bodyEl.value, {
    group: 'horizontes',
    // A ordem da coluna vem sempre dos dados (data/hora, A-Z…) e não há campo de
    // posição manual na tarefa — reordenar dentro da coluna só faria o DOM
    // divergir do que o Vue renderizou, e aí o card mexido deixava de ser movido
    // nas re-ordenações seguintes. Arrastar PARA outra coluna continua liberado.
    sort: false,
    animation: 140,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    forceFallback: false,
    onAdd(evt) {
      const id = (evt.item as HTMLElement).dataset.id
      // Devolve o nó à coluna de origem: quem renderiza a mudança é o Vue, a
      // partir do novo horizonte da tarefa. Sem isso o DOM da origem fica sem um
      // nó que o Vue ainda acha que existe.
      revertSortableMove(evt)
      if (id) emit('drop-task', id)
    },
  })
})
onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})

const count = computed(() => props.tasks.filter((t) => !t.done).length)

// Ordenação local da coluna (view-only, não altera dados nem persiste):
//   'none' = ordem vinda do pai (data+hora)
//   'due'  = vencimento (data+hora → só data → sem data em A–Z)
//   'az'   = alfabético por título
// Os dois botões são mutuamente exclusivos: clicar num desliga o outro.
type ColSort = 'none' | 'due' | 'az'
const colSort = ref<ColSort>('none')
function toggleSort(mode: Exclude<ColSort, 'none'>) {
  colSort.value = colSort.value === mode ? 'none' : mode
}

const displayTasks = computed(() => {
  if (colSort.value === 'az') return [...props.tasks].sort(compareAz)
  if (colSort.value === 'due') return [...props.tasks].sort(compareByDue)
  return props.tasks
})
</script>

<template>
  <section class="board-col" :data-h="horizonte.id">
    <header class="bcol-head">
      <div class="bcol-title">
        <span class="bcol-dot" />
        <BaseIcon v-if="icon" :name="icon" :size="15" class="bcol-ic" />
        <span class="bcol-name">{{ horizonte.label }}</span>
        <span class="bcol-count">{{ count }}</span>
      </div>
      <div class="bcol-tools">
        <button
          type="button"
          class="bcol-btn"
          :class="{ active: colSort === 'due' }"
          :aria-pressed="colSort === 'due'"
          :title="
            colSort === 'due'
              ? 'Ordenação padrão'
              : 'Ordenar por vencimento (data + hora → data → A–Z)'
          "
          aria-label="Ordenar por vencimento"
          @click="toggleSort('due')"
        >
          <BaseIcon name="calendar-arrow-down" :size="15" />
        </button>
        <button
          type="button"
          class="bcol-btn"
          :class="{ active: colSort === 'az' }"
          :aria-pressed="colSort === 'az'"
          :title="colSort === 'az' ? 'Ordenação padrão' : 'Ordenar A-Z'"
          aria-label="Ordenar A-Z"
          @click="toggleSort('az')"
        >
          <BaseIcon name="arrow-down-a-z" :size="15" />
        </button>
        <button
          type="button"
          class="bcol-btn"
          aria-label="Adicionar tarefa"
          @click="emit('add', horizonte.id)"
        >
          <BaseIcon name="plus" :size="15" />
        </button>
      </div>
    </header>

    <div
      ref="bodyEl"
      class="bcol-body"
      :class="{ empty: tasks.length === 0 }"
    >
      <BoardCard
        v-for="t in displayTasks"
        :key="t.id"
        :task="t"
        @open="emit('open-task', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.board-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 300px;
  flex: 0 0 300px;
}
.bcol-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 10px;
}
.bcol-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.bcol-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.board-col[data-h="core7"] .bcol-dot      { background: var(--core7-bar); }
.board-col[data-h="core30"] .bcol-dot     { background: var(--core30-bar); }
.board-col[data-h="core60"] .bcol-dot     { background: var(--core60-bar); }
.board-col[data-h="core90"] .bcol-dot     { background: var(--core90-bar); }
.board-col[data-h="hibernando"] .bcol-dot { background: var(--hibernando-bar); }
.bcol-ic {
  color: var(--text-3);
  flex-shrink: 0;
}
.bcol-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
.bcol-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
.bcol-tools {
  display: flex;
  align-items: center;
  gap: 1px;
}
.bcol-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.bcol-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.bcol-btn.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.bcol-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
  padding: 2px;
  flex: 1;
}
/* Coluna vazia: continua alta (header sticky o tempo todo), mas a caixa
   tracejada fica compacta no topo em vez de esticar pela coluna inteira. */
.bcol-body.empty {
  justify-content: flex-start;
  align-items: stretch;
  padding: 0;
}
.bcol-body.empty::before {
  content: 'Arraste tarefas aqui';
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-4);
  font-size: 12px;
  text-align: center;
}
.bcol-body :deep(.drag-ghost) {
  opacity: 0.4;
}
.bcol-body :deep(.drag-chosen) {
  box-shadow: var(--shadow-lg);
}
</style>

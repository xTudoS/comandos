<script setup lang="ts">
import Sortable from 'sortablejs'
import type { Task } from '~/composables/useTasks'
import { revertSortableMove } from '~/utils/sortableDom'

const props = withDefaults(
  defineProps<{
    horizonte: { id: string; label: string; desc: string }
    tasks: Task[]
  }>(),
  {},
)
const emit = defineEmits<{
  'drop-task': [id: string]
  'open-task': [task: Task]
}>()

const expandedId = ref<string | null>(null)
function onToggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

const bodyEl = ref<HTMLElement>()
let sortable: Sortable | null = null

onMounted(() => {
  if (!bodyEl.value) return
  sortable = Sortable.create(bodyEl.value, {
    group: 'horizontes',
    // Ordem derivada dos dados: sem reordenação manual dentro da lista (ver
    // revertSortableMove). Arrastar para outro horizonte continua liberado.
    sort: false,
    animation: 140,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    forceFallback: false,
    onAdd(evt) {
      const id = (evt.item as HTMLElement).dataset.id
      revertSortableMove(evt)
      if (id) emit('drop-task', id)
    },
  })
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})

const undoneCount = computed(() => props.tasks.filter((t) => !t.done).length)
</script>

<template>
  <div class="horizonte" :data-h="horizonte.id">
    <div class="horizonte-head">
      <div class="label">
        {{ horizonte.label }}
        <span class="count">{{ undoneCount }}</span>
      </div>
      <div class="desc">{{ horizonte.desc }}</div>
    </div>
    <div
      ref="bodyEl"
      class="horizonte-body"
      :class="{ empty: tasks.length === 0 }"
    >
      <TarefasTaskCard
        v-for="t in tasks"
        :key="t.id"
        :task="t"
        :expanded="expandedId === t.id"
        @toggle="onToggle"
        @edit="$emit('open-task', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.horizonte {
  margin-bottom: 18px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  overflow: hidden;
}
.horizonte-head {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
  position: relative;
  gap: 8px;
}
.horizonte-head::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.horizonte[data-h="core7"] .horizonte-head::before      { background: var(--core7-bar); }
.horizonte[data-h="core30"] .horizonte-head::before     { background: var(--core30-bar); }
.horizonte[data-h="core60"] .horizonte-head::before     { background: var(--core60-bar); }
.horizonte[data-h="core90"] .horizonte-head::before     { background: var(--core90-bar); }
.horizonte[data-h="hibernando"] .horizonte-head::before { background: var(--hibernando-bar); }

.horizonte-head .label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 10px;
}
.horizonte-head .count {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.horizonte-head .desc {
  font-size: 11px;
  color: var(--text-3);
}
.horizonte-body {
  min-height: 30px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.horizonte-body.empty::before {
  content: 'Vazio. Arraste tarefas aqui.';
  display: block;
  text-align: center;
  color: var(--text-4);
  font-size: 12px;
  padding: 12px;
  font-style: italic;
}
.horizonte-body :deep(.drag-ghost) {
  opacity: 0.35;
  background: var(--accent-soft);
}
.horizonte-body :deep(.drag-chosen) {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}
</style>

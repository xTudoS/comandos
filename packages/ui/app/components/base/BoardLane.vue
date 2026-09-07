<script setup lang="ts" generic="T extends { id: string }">
// Coluna de board genérica (reutilizável fora de tarefas). Renderiza cada item
// via slot `item`, e — quando `group` é informado — habilita arrastar entre
// colunas com SortableJS, emitindo `drop-item` com o id do card solto aqui.
// Sem `group` a coluna é somente-leitura (ex.: board por status derivado).
import Sortable from 'sortablejs'

const props = defineProps<{
  laneId: string
  label: string
  items: T[]
  icon?: string
  /** Cor da bolinha do cabeçalho (ex.: cor da categoria/status). */
  color?: string
  /** Grupo do SortableJS. Quando ausente, a coluna não é arrastável. */
  group?: string
  /** Mostra o botão "+" no cabeçalho. */
  addable?: boolean
  /** Texto do placeholder quando vazia. */
  emptyLabel?: string
}>()
const emit = defineEmits<{
  'drop-item': [id: string]
  add: [laneId: string]
}>()

const bodyEl = ref<HTMLElement>()
let sortable: Sortable | null = null

onMounted(() => {
  if (!bodyEl.value || !props.group) return
  sortable = Sortable.create(bodyEl.value, {
    group: props.group,
    animation: 140,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    onAdd(evt) {
      const id = (evt.item as HTMLElement).dataset.id
      // O SortableJS move o nó no DOM; removemos para o Vue re-renderizar do estado.
      evt.item.parentNode?.removeChild(evt.item)
      if (id) emit('drop-item', id)
    },
  })
})
onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})
</script>

<template>
  <section class="board-col">
    <header class="bcol-head">
      <div class="bcol-title">
        <span v-if="color" class="bcol-dot" :style="{ background: color }" />
        <BaseIcon v-if="icon" :name="icon" :size="15" class="bcol-ic" />
        <span class="bcol-name">{{ label }}</span>
        <span class="bcol-count">{{ items.length }}</span>
      </div>
      <button
        v-if="addable"
        type="button"
        class="bcol-btn"
        aria-label="Adicionar"
        @click="emit('add', laneId)"
      >
        <BaseIcon name="plus" :size="15" />
      </button>
    </header>

    <div
      ref="bodyEl"
      class="bcol-body"
      :class="{ empty: items.length === 0, 'no-drag': !group }"
      :data-empty-label="emptyLabel ?? 'Vazio'"
    >
      <div v-for="it in items" :key="it.id" :data-id="it.id" class="bcol-item">
        <slot name="item" :item="it" />
      </div>
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

.bcol-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
  padding: 2px;
  flex: 1;
}
.bcol-item {
  min-width: 0;
}
.bcol-body.empty {
  justify-content: flex-start;
  align-items: stretch;
  padding: 0;
}
.bcol-body.empty::before {
  content: attr(data-empty-label);
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

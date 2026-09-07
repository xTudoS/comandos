<script setup lang="ts">
import { reactive } from 'vue'
import Sortable from 'sortablejs'
import type { Task } from '~/composables/useTasks'
import { fmtBRDate } from '~/utils/dates'
import { dueOf, isOverdue } from '~/utils/overdue'
import { revertSortableMove } from '~/utils/sortableDom'

type Group = { id: string; label: string; desc: string; tasks: Task[] }

defineProps<{ groups: Group[] }>()
const emit = defineEmits<{
  'open-task': [task: Task]
  'toggle-done': [task: Task]
  add: [horizonId: string]
  move: [taskId: string, toHorizonId: string]
}>()

// Estado de expansão por grupo (todos abertos por padrão).
const collapsed = reactive<Record<string, boolean>>({})
function toggle(id: string) {
  collapsed[id] = !collapsed[id]
}

// ── Drag-and-drop entre horizontes (mesmo padrão do board) ──────────────────
// Cada corpo de grupo vira um Sortable do mesmo grupo 'lv-horizontes'. Ao soltar
// numa lista diferente, o onAdd devolve o nó à origem (o Vue é quem renderiza) e
// emite `move(taskId, horizonteDestino)`; o pai chama moveHorizon (otimista).
const rowsEls = new Map<string, HTMLElement>()
const sortables: Sortable[] = []
function setRowsEl(id: string, el: Element | null) {
  if (el) rowsEls.set(id, el as HTMLElement)
  else rowsEls.delete(id)
}
onMounted(() => {
  for (const [id, el] of rowsEls) {
    sortables.push(
      Sortable.create(el, {
        group: 'lv-horizontes',
        // Ordem derivada dos dados: sem reordenação manual dentro do grupo (ver
        // revertSortableMove). Arrastar para outro horizonte continua liberado.
        sort: false,
        animation: 140,
        draggable: '.lv-row',
        ghostClass: 'lv-drag-ghost',
        chosenClass: 'lv-drag-chosen',
        onAdd(evt) {
          const tid = (evt.item as HTMLElement).dataset.id
          revertSortableMove(evt)
          if (tid) emit('move', tid, id)
        },
      }),
    )
  }
})
onBeforeUnmount(() => {
  sortables.forEach((s) => s.destroy())
  sortables.length = 0
})

function dueLabel(t: Task): string {
  const d = dueOf(t)
  return d ? fmtBRDate(d) : '—'
}
function peopleOf(t: Task) {
  const out = t.delegatePersonName ? [{ name: t.delegatePersonName }] : []
  for (const p of t.participants ?? []) out.push({ name: p.name })
  return out
}

// Tarefa que chegou de outra pessoa (delegada ou por convite).
const { isForeign } = useViewer()
function originOf(t: Task): string {
  if (!isForeign(t)) return ''
  return t.ownerName || t.createdByName || ''
}
</script>

<template>
  <div class="lv">
    <section v-for="g in groups" :key="g.id" class="lv-group" :data-h="g.id">
      <header class="lv-grp-head">
        <button
          type="button"
          class="lv-grp-toggle"
          :aria-expanded="!collapsed[g.id]"
          @click="toggle(g.id)"
        >
          <BaseIcon :name="collapsed[g.id] ? 'chevron-right' : 'chevron-down'" :size="16" />
          <span class="lv-grp-title">{{ g.label }}</span>
          <span class="lv-grp-count">{{ g.tasks.length }}</span>
        </button>
        <button type="button" class="lv-grp-add" @click="emit('add', g.id)">
          <BaseIcon name="plus" :size="14" />
          Adicionar
        </button>
      </header>

      <div v-show="!collapsed[g.id]" class="lv-table">
        <div class="lv-row lv-row--head">
          <span class="lv-col-task">Tarefa</span>
          <span class="lv-col-desc">Descrição</span>
          <span class="lv-col-assignee">Responsável</span>
          <span class="lv-col-due">Prazo</span>
          <span class="lv-col-status">Status</span>
        </div>

        <div class="lv-rows" :ref="(el) => setRowsEl(g.id, el as Element | null)">
        <button
          v-for="t in g.tasks"
          :key="t.id"
          type="button"
          class="lv-row"
          :class="{ done: t.done }"
          :data-id="t.id"
          @click="emit('open-task', t)"
        >
          <span class="lv-col-task">
            <span
              class="lv-check"
              :class="[t.type, { done: t.done }]"
              role="checkbox"
              :aria-checked="t.done"
              @click.stop="emit('toggle-done', t)"
            >
              <BaseIcon v-if="t.done" name="check" :size="11" />
            </span>
            <span class="lv-title">{{ t.title }}</span>
            <span
              v-if="originOf(t)"
              class="lv-origin"
              :title="`Tarefa de ${originOf(t)}`"
            >
              <BaseIcon name="user" :size="10" />
              De {{ originOf(t) }}
            </span>
          </span>

          <span class="lv-col-desc">{{ t.description || '—' }}</span>

          <span class="lv-col-assignee">
            <AvatarStack
              v-if="peopleOf(t).length"
              :people="peopleOf(t)"
              :size="24"
              :max="3"
            />
            <span v-else class="lv-muted">—</span>
          </span>

          <span class="lv-col-due" :class="{ overdue: isOverdue(t) }">
            {{ dueLabel(t) }}
          </span>

          <span class="lv-col-status">
            <span class="lv-badge" :class="t.done ? 'is-done' : 'is-open'">
              <BaseIcon :name="t.done ? 'circle-check' : 'circle-dashed'" :size="12" />
              {{ t.done ? 'Concluída' : 'Pendente' }}
            </span>
          </span>
        </button>

        <div v-if="g.tasks.length === 0" class="lv-empty">
          Arraste tarefas para este horizonte.
        </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lv {
  display: flex;
  flex-direction: column;
  gap: 26px;
}

/* ── Group header ─────────────────────────────── */
.lv-grp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.lv-grp-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  color: var(--text);
  padding: 2px 4px;
}
.lv-grp-toggle :deep(svg) {
  color: var(--text-3);
}
.lv-grp-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.lv-grp-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.lv-grp-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 500;
  transition: background var(--dur-fast) var(--ease-spring);
}
.lv-grp-add:hover {
  background: var(--surface-hover);
  color: var(--text);
}

/* ── Table ────────────────────────────────────── */
.lv-table {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.lv-row {
  display: grid;
  grid-template-columns:
    minmax(220px, 1.7fr) minmax(200px, 2fr) 132px 150px 140px;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 0 18px;
  height: 56px;
  text-align: left;
  border-bottom: 1px solid var(--border-faint);
  background: transparent;
  transition: background var(--dur-fast) var(--ease-spring);
}
.lv-row:last-child {
  border-bottom: none;
}
.lv-row--head {
  height: 42px;
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
  cursor: default;
}
.lv-row--head span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: none;
}
button.lv-row:hover {
  background: var(--surface-hover);
}

.lv-col-task {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.lv-check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-fg);
  transition: background var(--dur-fast) var(--ease-spring),
    border-color var(--dur-fast) var(--ease-spring);
}
.lv-check.ceo {
  border-color: color-mix(in srgb, var(--ceo-fg) 55%, var(--border-strong));
}
.lv-check.delegate {
  border-color: color-mix(in srgb, var(--delego-fg) 55%, var(--border-strong));
}
.lv-check.personal {
  border-color: color-mix(in srgb, var(--pessoal-fg) 55%, var(--border-strong));
}
.lv-check.done {
  background: var(--success);
  border-color: var(--success);
}
.lv-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lv-row.done .lv-title {
  color: var(--text-3);
  text-decoration: line-through;
}
.lv-origin {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 140px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}

.lv-col-desc {
  font-size: 13px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lv-muted {
  color: var(--text-4);
}
.lv-col-due {
  font-size: 13px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.lv-col-due.overdue {
  color: var(--danger);
  font-weight: 600;
}

.lv-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
}
.lv-badge.is-open {
  background: var(--surface-hover);
  color: var(--text-3);
}
.lv-badge.is-done {
  background: var(--delego-bg);
  color: var(--delego-fg);
}

.lv-empty {
  padding: 18px;
  text-align: center;
  font-size: 13px;
  color: var(--text-4);
}

/* ── Drag-and-drop ────────────────────────────── */
.lv-rows :deep(.lv-drag-ghost) {
  opacity: 0.4;
}
.lv-rows :deep(.lv-drag-chosen) {
  background: var(--surface-hover);
  box-shadow: var(--shadow-md);
}
button.lv-row {
  cursor: grab;
}
button.lv-row:active {
  cursor: grabbing;
}

@media (max-width: 880px) {
  .lv-row {
    grid-template-columns: minmax(160px, 1.7fr) 110px 120px;
  }
  .lv-col-desc,
  .lv-col-due {
    display: none;
  }
}
</style>

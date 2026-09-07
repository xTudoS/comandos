<script setup lang="ts">
import { fmtBRDate } from '~/utils/dates'
import type { Task } from '~/composables/useTasks'

// `removable` só é ligado nos quadros customizados: lá o card tem uma existência
// própria (a presença da tarefa naquele quadro) que pode ser desfeita sem mexer
// na tarefa. No board de horizontes não existe esse conceito.
// `hideBoardId`: dentro de um quadro, o chip daquele mesmo quadro é ruído —
// você já sabe onde está.
const props = defineProps<{ task: Task; removable?: boolean; hideBoardId?: string }>()
const emit = defineEmits<{ open: [Task]; toggle: [string]; remove: [string] }>()

const { complete } = useTasks()
const { list: projects } = useProjects()
const companies = useCompanies()
const { isForeign } = useViewer()

const PRIORITY: Record<Task['type'], { label: string; cls: string }> = {
  ceo: { label: 'CEO', cls: 'p-urgent' },
  delegate: { label: 'Delego', cls: 'p-low' },
  personal: { label: 'Pessoal', cls: 'p-normal' },
}

const priority = computed(() => PRIORITY[props.task.type])

const project = computed(() =>
  props.task.projectId
    ? projects.value.find((p) => p.id === props.task.projectId) ?? null
    : null,
)
const company = computed(() => companies.byId(props.task.companyId))

const subtitle = computed(
  () => project.value?.name || company.value?.name || '',
)

const ref4 = computed(() => props.task.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase())

const dueLabel = computed(() => {
  const d = props.task.scheduledDate || props.task.followupDate
  if (!d) return ''
  const base = fmtBRDate(d)
  // Hora só existe para agendamento (scheduledTime); follow-up não tem horário.
  const time = props.task.scheduledDate && props.task.scheduledTime
    ? props.task.scheduledTime
    : ''
  return time ? `${base} · ${time}` : base
})

const hasNotes = computed(() => !!props.task.description?.trim())

// `boards` pode faltar em linha otimista antiga ainda na fila offline.
const shownBoards = computed(() =>
  (props.task.boards ?? []).filter((b) => b.id !== props.hideBoardId),
)

const people = computed(() => {
  const out: { name: string }[] = []
  if (props.task.type === 'delegate' && props.task.delegatePersonName)
    out.push({ name: props.task.delegatePersonName })
  for (const p of props.task.participants ?? []) out.push({ name: p.name })
  return out
})

// Tarefa que chegou de outra pessoa (delegada ou por convite): marca a origem
// pra não se confundir com as próprias no meio da coluna.
const originLabel = computed(() => {
  if (!isForeign(props.task)) return ''
  return props.task.ownerName || props.task.createdByName || ''
})

const updatedLabel = computed(() => {
  const iso = props.task.updatedAt || props.task.createdAt
  if (!iso) return ''
  try {
    return fmtBRDate(String(iso).slice(0, 10))
  } catch {
    return ''
  }
})

async function onToggle(e: Event) {
  e.stopPropagation()
  await complete(props.task.id, !props.task.done)
}
</script>

<template>
  <article
    class="board-card"
    :class="{ done: task.done, micro: task.isMicro }"
    :data-id="task.id"
    @click="emit('open', task)"
  >
    <div class="bc-top">
      <span class="bc-ref">
        <BaseIcon name="link" :size="12" />
        MDS-{{ ref4 }}
      </span>
      <div class="bc-top-right">
        <span v-if="originLabel" class="bc-origin" :title="`Tarefa de ${originLabel}`">
          <BaseIcon name="user" :size="10" />
          De {{ originLabel }}
        </span>
        <span v-if="task.isMicro" class="bc-micro">
          <BaseIcon name="zap" :size="10" />
          Micro
        </span>
        <span class="bc-priority" :class="priority.cls">
          <BaseIcon name="flag" :size="11" />
          {{ priority.label }}
        </span>
        <button
          v-if="removable"
          type="button"
          class="bc-remove"
          aria-label="Remover do quadro"
          title="Remover do quadro (a tarefa continua existindo)"
          @click.stop="emit('remove', task.id)"
        >
          <BaseIcon name="x" :size="12" />
        </button>
      </div>
    </div>

    <div class="bc-title-row">
      <button
        type="button"
        class="bc-check"
        :aria-label="task.done ? 'Reabrir' : 'Concluir'"
        :aria-pressed="task.done"
        @click="onToggle"
      />
      <h4 class="bc-title">{{ task.title }}</h4>
    </div>
    <p v-if="subtitle" class="bc-sub">
      <BaseIcon name="corner-down-right" :size="13" class="bc-sub-ic" />
      {{ subtitle }}
    </p>

    <div v-if="dueLabel" class="bc-due">
      <BaseIcon name="calendar" :size="13" />
      Vence: {{ dueLabel }}
    </div>

    <footer class="bc-foot">
      <div class="bc-foot-left">
        <AvatarStack v-if="people.length" :people="people" :size="22" :max="3" />
        <span
          v-for="b in shownBoards"
          :key="b.id"
          class="bc-board"
          :style="b.color ? { '--chip': b.color } : undefined"
          :title="`No quadro ${b.name}`"
        >
          <BaseIcon name="columns-3" :size="11" />
          {{ b.name }}
        </span>
      </div>
      <div class="bc-meta">
        <span v-if="hasNotes" class="bc-stat" title="Tem descrição">
          <BaseIcon name="message-circle" :size="13" />
        </span>
        <span v-if="updatedLabel" class="bc-date">{{ updatedLabel }}</span>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.board-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition:
    box-shadow var(--dur-fast) var(--ease-spring),
    border-color var(--dur-fast) var(--ease-spring),
    transform var(--dur-fast) var(--ease-spring);
}
.board-card:hover {
  box-shadow: var(--shadow-card-hover);
  border-color: var(--border-strong);
}
/* Micro: ação rápida — destaque com accent roxo à esquerda. */
.board-card.micro {
  border-left: 3px solid var(--micro-bar);
}
.board-card.done {
  opacity: 0.6;
}
.board-card.done .bc-title {
  text-decoration: line-through;
  color: var(--text-3);
}

.bc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bc-ref {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.bc-top-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
/* Aparece só no hover do card: é uma ação destrutiva-ish (num quadro
   compartilhado revoga acesso), não merece peso visual permanente. */
.bc-remove {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-4);
  opacity: 0;
  transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
}
.board-card:hover .bc-remove,
.bc-remove:focus-visible {
  opacity: 1;
}
.bc-remove:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.bc-origin {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 120px;
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
.bc-micro {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--micro-bar);
  background: color-mix(in srgb, var(--micro-bar) 14%, transparent);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}
.bc-priority {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
}
.bc-priority.p-urgent {
  color: var(--ceo-fg);
}
.bc-priority.p-normal {
  color: var(--pessoal-fg);
}
.bc-priority.p-low {
  color: var(--delego-fg);
}

.bc-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.bc-check {
  flex-shrink: 0;
  margin-top: 1px;
  position: relative;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: var(--surface-alt);
  cursor: pointer;
  padding: 0;
  transition: background var(--dur-fast) var(--ease-spring),
    border-color var(--dur-fast) var(--ease-spring);
}
/* Marca desenhada uma vez: esmaecida no hover, cheia quando concluída. */
.bc-check::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 3px;
  width: 5px;
  height: 9px;
  border: solid var(--accent-fg);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-spring);
}
.bc-check:hover {
  border-color: var(--success);
  background: color-mix(in srgb, var(--success) 16%, var(--surface));
}
.bc-check:hover::after {
  opacity: 1;
  border-color: var(--success);
}
.bc-check:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.board-card.done .bc-check {
  background: var(--success);
  border-color: var(--success);
}
.board-card.done .bc-check::after {
  opacity: 1;
  border-color: var(--accent-fg);
}

.bc-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text);
}
.bc-sub {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-3);
  min-width: 0;
}
.bc-sub-ic {
  color: var(--text-4);
  flex-shrink: 0;
}
.bc-due {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
}
.bc-due :deep(svg) {
  color: var(--text-3);
}

.bc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--border-faint);
}
.bc-foot-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
/* Chip de quadro: usa a cor do quadro quando ela existe, senão cinza neutro —
   a cor é opcional e o chip não pode depender dela para ser legível. */
.bc-board {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 130px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--chip, var(--text-3));
  background: color-mix(in srgb, var(--chip, var(--text-3)) 12%, transparent);
}
.bc-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
.bc-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.bc-date {
  font-size: 12px;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>

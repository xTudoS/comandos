<script setup lang="ts">
import type { ActionItem, ContextMenuItem } from '#ui/types'
import { fmtBRDate } from '~/utils/dates'
import type { Task } from '~/composables/useTasks'
import { AREA_META } from '~/composables/useLifeTracker'
import { HORIZONTES, horizonUIToDb, horizonDbToUI } from '~/utils/horizontes'
const props = defineProps<{ task: Task; expanded?: boolean }>()
const emit = defineEmits<{
  open: [Task]
  edit: [Task]
  arquivar: [Task]
  deletar: [Task]
  toggle: [string]
}>()

const { complete, archive, remove, update } = useTasks()
const { list: projects } = useProjects()
const companies = useCompanies()
const { ask } = useConfirm()
const { isForeign } = useViewer()

const lifeArea = computed(() => (props.task.lifeArea ? AREA_META[props.task.lifeArea] : null))

// Tarefa que chegou de outra pessoa (delegada ou por convite).
const originLabel = computed(() => {
  if (!isForeign(props.task)) return ''
  return props.task.ownerName || props.task.createdByName || ''
})

const tipoLabel: Record<Task['type'], string> = {
  ceo: 'CEO',
  delegate: 'Delego',
  personal: 'Pessoal',
}
const tipoClass: Record<Task['type'], string> = {
  ceo: 'ceo',
  delegate: 'delego',
  personal: 'pessoal',
}

const project = computed(() =>
  props.task.projectId
    ? projects.value.find((p) => p.id === props.task.projectId) ?? null
    : null,
)
const company = computed(() => companies.byId(props.task.companyId))

const followupBadgeText = computed(() => {
  const date = props.task.followupDate
  if (!date) return ''
  const desc = props.task.followupDescription?.trim()
  return `${fmtBRDate(date)} · ${desc && desc.length > 0 ? desc : 'eu'}`
})

const hasAgenda = computed(
  () => !!props.task.scheduledDate && !props.task.followupActive,
)

const actions: ActionItem[] = [
  { key: 'edit', label: 'Editar', icon: 'pencil' },
  { key: 'arquivar', label: 'Arquivar', icon: 'archive', tone: 'warning' },
  { key: 'deletar', label: 'Apagar', icon: 'trash-2', tone: 'danger' },
]

const ctxItems = computed<ContextMenuItem[]>(() => [
  {
    key: 'toggle-done',
    label: props.task.done ? 'Reabrir tarefa' : 'Concluir tarefa',
    icon: props.task.done ? 'rotate-ccw' : 'check-circle-2',
  },
  { key: 'edit', label: 'Editar', icon: 'pencil', shortcut: '↵' },
  {
    key: 'horizon',
    label: 'Mover horizonte',
    icon: 'target',
    children: HORIZONTES.map((h) => ({
      key: `horizon:${h.id}`,
      label: h.label,
      checked: horizonDbToUI[props.task.horizon] === h.id,
    })),
  },
  ...(hasAgenda.value
    ? [{ key: 'agenda-remove', label: 'Tirar da agenda', icon: 'calendar-x' }]
    : []),
  { separator: true },
  { key: 'arquivar', label: 'Arquivar', icon: 'archive', tone: 'danger' as const },
  { key: 'deletar', label: 'Apagar', icon: 'trash-2', tone: 'danger' as const },
])

async function onCtxSelect(key: string) {
  if (key === 'toggle-done') await complete(props.task.id, !props.task.done)
  else if (key === 'edit') onEdit()
  else if (key === 'agenda-remove') await onTirarAgenda()
  else if (key === 'arquivar') onArquivar()
  else if (key === 'deletar') onDeletar()
  else if (key.startsWith('horizon:'))
    await update(props.task.id, {
      horizon: horizonUIToDb[key.slice(8) as keyof typeof horizonUIToDb],
    })
}

async function onToggle(e: Event) {
  e.stopPropagation()
  await complete(props.task.id, !props.task.done)
}

function onCardClick() {
  emit('toggle', props.task.id)
}

function onEdit() {
  emit('edit', props.task)
  emit('open', props.task)
}

async function onTirarAgenda() {
  await update(props.task.id, { scheduledDate: null, scheduledTime: null })
}

function onArquivar() {
  ask(
    `Arquivar "${props.task.title}"?`,
    async () => {
      await archive(props.task.id, true)
      emit('arquivar', props.task)
    },
    { titulo: 'Arquivar tarefa', okLabel: 'Arquivar', okClass: 'warning' },
  )
}

function onDeletar() {
  ask(
    `Apagar "${props.task.title}" permanentemente? Essa ação não pode ser desfeita.`,
    async () => {
      await remove(props.task.id)
      emit('deletar', props.task)
    },
    { titulo: 'Apagar tarefa', okLabel: 'Apagar', okClass: 'danger' },
  )
}

function onAction(key: string) {
  if (key === 'edit') onEdit()
  else if (key === 'arquivar') onArquivar()
  else if (key === 'deletar') onDeletar()
}
</script>

<template>
  <BaseContextMenu :items="ctxItems" @select="onCtxSelect">
  <div
    class="task"
    :class="{
      done: task.done,
      'has-followup': task.followupActive,
      'is-expanded': expanded,
    }"
    :data-id="task.id"
    @click="onCardClick"
  >
    <div class="task-main">
      <button
        type="button"
        class="check"
        :aria-label="task.done ? 'Marcar como pendente' : 'Concluir tarefa'"
        :aria-pressed="task.done"
        @click="onToggle"
      />
      <div class="task-titulo">{{ task.title }}</div>
      <div class="task-badges">
        <span v-if="task.isMicro" class="badge-micro" title="Micro · ação rápida">
          <BaseIcon name="zap" :size="10" class="badge-ico" />
          Micro
        </span>
        <span
          v-if="task.followupActive && task.followupDate"
          class="badge-followup"
        >
          <BaseIcon name="hourglass" :size="12" class="badge-ico" />
          {{ followupBadgeText }}
        </span>
        <span v-else-if="task.scheduledDate" class="badge-agenda">
          {{ fmtBRDate(task.scheduledDate)
          }}{{ task.scheduledTime ? ` · ${task.scheduledTime}` : '' }}
        </span>
        <span
          v-if="task.type === 'delegate' && task.delegatePersonName"
          class="badge-delegado"
        >
          {{ task.delegatePersonName }}
        </span>
        <span
          v-if="originLabel"
          class="badge-origem"
          :title="`Tarefa de ${originLabel}`"
        >
          <BaseIcon name="user" :size="10" class="badge-ico" />
          De {{ originLabel }}
        </span>
        <span
          v-if="project"
          class="badge-projeto"
          :class="project.category"
        >
          {{ project.name }}
        </span>
        <span
          v-if="company"
          class="badge-empresa"
          :title="`Empresa: ${company.name}`"
        >
          <BaseIcon name="building-2" :size="10" class="badge-ico" />
          {{ company.name }}
        </span>
        <span class="badge-tipo" :class="tipoClass[task.type]">
          {{ tipoLabel[task.type] }}
        </span>
        <span
          v-if="lifeArea"
          class="badge-vida"
          :style="{
            background: `color-mix(in srgb, ${lifeArea.color} 14%, transparent)`,
            color: lifeArea.color,
          }"
          :title="`Área da vida: ${lifeArea.label}`"
        >
          <BaseIcon :name="lifeArea.icon" :size="10" class="badge-ico" />
          {{ lifeArea.label }}
        </span>
      </div>
      <div class="task-menu" @click.stop>
        <BaseActionMenu
          :items="actions"
          aria-label="Ações da tarefa"
          @select="onAction"
        />
      </div>
    </div>

    <div v-if="expanded" class="task-body" @click.stop>
      <p v-if="task.description" class="task-desc">{{ task.description }}</p>
      <p v-else class="task-desc empty">Sem descrição.</p>

      <div class="task-actions">
        <button type="button" class="ta-btn primary" @click="onEdit">
          Editar
        </button>
        <button
          v-if="hasAgenda"
          type="button"
          class="ta-btn ghost"
          @click="onTirarAgenda"
        >
          Tirar da agenda
        </button>
        <button type="button" class="ta-btn warning" @click="onArquivar">
          Arquivar
        </button>
        <button type="button" class="ta-btn danger" @click="onDeletar">
          Apagar
        </button>
      </div>

      <section class="task-section">
        <h4 class="task-section-h">Checklist</h4>
        <TarefasChecklist :task-id="task.id" />
      </section>

      <section class="task-section">
        <h4 class="task-section-h">Anotações da tarefa</h4>
        <TarefasAnotacoes :task-id="task.id" />
      </section>
    </div>
  </div>
  </BaseContextMenu>
</template>

<style scoped>
.task {
  background: var(--surface);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s;
  user-select: none;
}
.task:hover {
  background: var(--surface-hover);
  border-color: var(--border);
}
.task.is-expanded {
  background: var(--surface);
  border-color: var(--border);
  cursor: default;
}
.task.has-followup {
  background: var(--followup-bg);
}
.task.has-followup:hover {
  background: var(--followup-bg);
  border-color: var(--followup-fg);
}
.task.done .task-titulo {
  text-decoration: line-through;
  color: var(--text-3);
}
.task-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: var(--surface-alt);
  flex-shrink: 0;
  cursor: pointer;
  position: relative;
  padding: 0;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.check::before {
  content: '';
  position: absolute;
  inset: -12px;
}
/* Marca (check) desenhada uma vez; aparece esmaecida no hover e cheia quando done. */
.check::after {
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
  transition: opacity 0.12s;
}
.check:hover {
  border-color: var(--success);
  background: color-mix(in srgb, var(--success) 16%, var(--surface));
}
.check:hover::after {
  opacity: 1;
  border-color: var(--success);
}
.check:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.task.done .check {
  background: var(--success);
  border-color: var(--success);
}
.task.done .check::after {
  opacity: 1;
  border-color: var(--accent-fg);
}
.task.done .check:hover {
  background: var(--success);
}
.task-titulo {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-badges {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 50%;
}
.task-menu {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}
.task:hover .task-menu,
.task.is-expanded .task-menu,
.task-menu:focus-within {
  opacity: 1;
}
@media (max-width: 780px) {
  .task-menu {
    opacity: 1;
  }
}

/* === Expanded body === */
.task-body {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: default;
}
.task-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.5;
  white-space: pre-wrap;
}
.task-desc.empty {
  color: var(--text-4);
  font-style: italic;
}
.task-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ta-btn {
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.ta-btn:hover {
  background: var(--surface-hover);
}
.ta-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}
.ta-btn.primary:hover {
  background: var(--accent-hover);
  filter: brightness(1.05);
}
.ta-btn.warning {
  border-color: var(--warning);
  color: var(--warning);
  background: transparent;
}
.ta-btn.warning:hover {
  background: #fef3e6;
}
.ta-btn.danger {
  border-color: var(--danger);
  color: var(--danger);
  background: transparent;
}
.ta-btn.danger:hover {
  background: #fdebec;
}
.task-section {
  border-top: 1px dashed var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-section-h {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

/* === Badges === */
.badge-tipo {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.badge-tipo.ceo {
  background: var(--ceo-bg);
  color: var(--ceo-fg);
}
.badge-tipo.delego {
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.badge-tipo.pessoal {
  background: var(--pessoal-bg);
  color: var(--pessoal-fg);
}
.badge-vida {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}
.badge-delegado {
  font-size: 10px;
  background: var(--delego-bg);
  color: var(--delego-fg);
  padding: 2px 8px;
  border-radius: 10px;
}
.badge-delegado::before {
  content: '→ ';
  opacity: 0.7;
}
.badge-origem {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--surface-hover);
  color: var(--text-3);
  border: 1px solid var(--border);
  white-space: nowrap;
}
.badge-projeto {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  background: var(--surface-alt);
  color: var(--text-2);
  border: 1px solid var(--border);
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge-projeto.company {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #4338ca;
}
.badge-projeto.product {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #15803d;
}
.badge-projeto.general {
  background: #fefce8;
  border-color: #fde68a;
  color: #854d0e;
}
.badge-projeto.personal {
  background: #fdf2f8;
  border-color: #fbcfe8;
  color: #9d174d;
}
.badge-agenda {
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}
.badge-followup {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  background: var(--followup-bg);
  color: var(--followup-fg);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}
.badge-empresa {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  background: var(--surface-alt);
  color: var(--text-2);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-micro {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--micro-bar);
  background: color-mix(in srgb, var(--micro-bar) 14%, transparent);
  padding: 2px 8px;
  border-radius: 10px;
}
.badge-ico {
  width: 10px;
  height: 10px;
}
</style>

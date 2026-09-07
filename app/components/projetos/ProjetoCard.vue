<script setup lang="ts">
import type { ActionItem } from '#ui/types'
// ProjetoCard — per design-spec-comando.md §7.13
//
// Card colapsável: head clicável (toggle expand) com dot por categoria,
// titulo, parent label opcional (produto vinculado a uma empresa), stats
// e chevron. Quando expandido, mostra notas (se houver) + actions.
//
// Tarefas embutidas e quick-add ainda não estão integrados — chegam quando a
// store de tasks for migrada para Pinia (Fase 3+). Por enquanto o card
// representa o projeto como entidade-pai com contagem de tarefas abertas e o
// menu de ações.

import { computed } from 'vue'
import type { CategoriaProjeto, Projeto } from '~/types/projeto'
import TarefasTaskCard from '~/components/tarefas/TaskCard.vue'

interface Props {
  projeto: Projeto
  /** Empresa-pai quando categoria='produto'. */
  parent?: Projeto | null
  /** Tarefas ativas (open) ligadas ao projeto — vem do counts da API. */
  openTaskCount: number
  expanded?: boolean
  /** Renderização compacta usada quando o card é um sub-card (produto sob empresa). */
  sub?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  parent: null,
  expanded: false,
  sub: false,
})

const emit = defineEmits<{
  toggle: [id: string]
  edit: [projeto: Projeto]
  arquivar: [projeto: Projeto]
  deletar: [projeto: Projeto]
}>()

const DOT_COLOR: Record<CategoriaProjeto, string> = {
  empresa: 'var(--color-proj-empresa-fg)',
  produto: 'var(--color-proj-produto-fg)',
  geral: 'var(--color-proj-geral-fg)',
  pessoal: 'var(--color-proj-pessoal-fg)',
}

const dotColor = computed(() => DOT_COLOR[props.projeto.categoria])

const { list: tasksList, refresh: refreshTasks } = useTasks()
const { openEdit: openTaskEdit } = useTaskModal()
const companies = useCompanies()
const company = computed(() => companies.byId(props.projeto.company_id))

const tasksDoProjeto = computed(() =>
  tasksList.value
    .filter((t) => t.projectId === props.projeto.id && !t.archived)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return (a.scheduledDate ?? '9999').localeCompare(b.scheduledDate ?? '9999')
    }),
)

const expandedTaskId = ref<string | null>(null)
function onTaskToggle(id: string) {
  expandedTaskId.value = expandedTaskId.value === id ? null : id
}

watch(
  () => props.expanded,
  (open) => {
    if (open && tasksList.value.length === 0) void refreshTasks()
  },
  { immediate: true },
)

// Sem dados de "feitas/total" o backend só expõe `openTaskCount`. Mostramos a
// barra como `zero` (rail neutro) quando não há tarefas e como `default` em
// progresso parcial (forçamos pct=0 — apenas indica trilho ativo). Quando
// usarmos a store de tasks, trocamos para progressoProjeto.pct real.
const progressTone = computed<'zero' | 'default'>(() =>
  props.openTaskCount === 0 ? 'zero' : 'default',
)

const actions: ActionItem[] = [
  { key: 'edit', label: 'Editar', icon: 'pencil' },
  { key: 'arquivar', label: 'Arquivar', icon: 'archive', tone: 'warning' },
  { key: 'deletar', label: 'Apagar', icon: 'trash-2', tone: 'danger' },
]

// Clique no corpo do head abre o modal de edição direto; o chevron (botão
// separado) é que expande/colapsa os detalhes inline.
function onHeadClick() {
  emit('edit', props.projeto)
}
function onToggleClick() {
  emit('toggle', props.projeto.id)
}

function onAction(key: string) {
  if (key === 'edit') emit('edit', props.projeto)
  else if (key === 'arquivar') emit('arquivar', props.projeto)
  else if (key === 'deletar') emit('deletar', props.projeto)
}
</script>

<template>
  <article class="projeto-card" :class="{ 'is-expanded': expanded, 'is-sub': sub }">
    <div class="p-head-row">
      <button
        type="button"
        class="p-head"
        @click="onHeadClick"
      >
        <span class="p-dot" :style="{ background: dotColor }" />
        <span class="p-titulo">{{ projeto.nome }}</span>
        <span v-if="parent" class="p-parent">· {{ parent.nome }}</span>
        <span class="p-stats">
          {{ openTaskCount }}
          {{ openTaskCount === 1 ? 'tarefa' : 'tarefas' }}
          {{ openTaskCount === 1 ? 'aberta' : 'abertas' }}
        </span>
      </button>
      <button
        type="button"
        class="p-chevron-btn"
        :aria-expanded="expanded"
        :aria-controls="`projeto-body-${projeto.id}`"
        aria-label="Expandir detalhes"
        @click="onToggleClick"
      >
        <span class="p-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="p-action-slot" @click.stop>
        <BaseActionMenu
          :items="actions"
          aria-label="Ações do projeto"
          @select="onAction"
        />
      </div>
    </div>

    <BaseProgressBar
      class="p-progress"
      :value="0"
      :tone="progressTone"
      :height="3"
    />

    <div
      v-show="expanded"
      :id="`projeto-body-${projeto.id}`"
      class="p-body"
    >
      <dl
        v-if="company || projeto.campo_valor"
        class="p-meta"
      >
        <template v-if="company">
          <dt>Empresa</dt>
          <dd>
            <BaseIcon name="building-2" :size="12" class="p-meta-ico" />
            {{ company.name }}
          </dd>
        </template>
        <template v-if="projeto.campo_valor">
          <dt>{{ projeto.campo_label || 'Campo' }}</dt>
          <dd>{{ projeto.campo_valor }}</dd>
        </template>
      </dl>

      <p v-if="projeto.notas" class="p-notas">{{ projeto.notas }}</p>
      <p v-else-if="!projeto.campo_valor && !company" class="p-empty">Sem descrição.</p>

      <section class="p-section">
        <h4 class="p-section-h">Tarefas vinculadas</h4>
        <p v-if="tasksDoProjeto.length === 0" class="p-empty">
          Nenhuma tarefa vinculada a este projeto.
        </p>
        <div v-else class="p-tasks">
          <TarefasTaskCard
            v-for="t in tasksDoProjeto"
            :key="t.id"
            :task="t"
            :expanded="expandedTaskId === t.id"
            @toggle="onTaskToggle"
            @edit="openTaskEdit"
          />
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.projeto-card {
  background: var(--color-surface);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--dur-base) var(--ease-spring),
              transform var(--dur-base) var(--ease-spring);
}

.projeto-card:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-1px);
}

.projeto-card.is-sub {
  background: var(--color-surface-alt);
  margin-left: 24px;
}

.p-head-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
}

.p-action-slot {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-base);
}
.projeto-card:hover .p-action-slot,
.p-action-slot:focus-within {
  opacity: 1;
}
@media (max-width: 780px) {
  .p-action-slot {
    opacity: 1;
  }
}

.p-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: 12px 14px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
  color: var(--color-text);
  transition: background var(--dur-base);
}

.projeto-card.is-sub .p-head {
  padding: 8px 12px;
}

.p-head:hover {
  background: var(--color-surface-hover);
}

.p-head:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong) inset;
}

.p-dot {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.p-titulo {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-14);
  font-weight: var(--fw-medium);
  color: var(--color-text);
}

.p-parent {
  flex: 0 0 auto;
  margin-left: -6px;
  font-size: var(--fs-11);
  font-weight: var(--fw-regular);
  color: var(--color-text-3);
}

.p-stats {
  flex: 0 0 auto;
  font-size: var(--fs-11);
  color: var(--color-text-3);
  font-variant-numeric: tabular-nums;
}

.p-chevron-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-4);
}
.p-chevron-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-2);
}
.p-chevron-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}
.p-chevron {
  flex: 0 0 auto;
  font-size: var(--fs-11);
  color: inherit;
  transition: transform var(--dur-base);
}

.is-expanded .p-chevron {
  transform: rotate(180deg);
}

.p-progress {
  border-radius: 0;
}

.p-body {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-alt);
}

.p-notas {
  margin: 0 0 10px;
  font-size: var(--fs-13);
  color: var(--color-text-2);
  line-height: var(--lh-relaxed);
  white-space: pre-wrap;
}

.p-empty {
  margin: 0;
  font-size: var(--fs-12);
  color: var(--color-text-4);
  font-style: italic;
}

.p-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.p-section-h {
  margin: 0;
  font-size: var(--fs-11);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-3);
}
.p-tasks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.p-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  margin: 0 0 10px;
  font-size: var(--fs-12);
  align-items: baseline;
}
.p-meta dt {
  font-weight: var(--fw-semibold);
  color: var(--color-text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--fs-10);
}
.p-meta dd {
  margin: 0;
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.p-meta-ico {
  color: var(--color-text-3);
}
</style>

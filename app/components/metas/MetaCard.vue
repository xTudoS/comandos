<script setup lang="ts">
import type { ActionItem } from '#ui/types'
// MetaCard — per design-spec-comando.md §7.14
//
// Card colapsável de meta. Tons azuis iOS por padrão; vermelho quando vencida;
// verde quando concluída. Body mostra m-stats-line, descrição, seções de
// "Projetos vinculados" e "Tarefas diretas" (lista lazy via slot por enquanto:
// integração concreta vem quando o store de tasks expor goalId), e footer com
// Editar / Arquivar / Deletar.

import { computed } from 'vue'
import type { Meta, StatusMeta } from '~/types/meta'
import type { ProgressoMeta } from '~/composables/useProgresso'
import { diasAtePrazo } from '~/composables/useStatus'
interface Props {
  meta: Meta
  progresso: ProgressoMeta
  status: StatusMeta
  expanded?: boolean
}

const props = withDefaults(defineProps<Props>(), { expanded: false })

const emit = defineEmits<{
  toggle: [id: string]
  edit: [meta: Meta]
  arquivar: [meta: Meta]
  deletar: [meta: Meta]
}>()

const dotColor = computed(() => {
  if (props.status === 'vencida') return 'var(--color-meta-vencida-from)'
  if (props.status === 'concluida') return 'var(--color-progresso-from)'
  return 'var(--color-meta-from)'
})

const progressTone = computed<'meta' | 'vencida' | 'full' | 'zero' | 'default'>(() => {
  if (props.progresso.total === 0) return 'zero'
  if (props.status === 'vencida') return 'vencida'
  if (props.progresso.pct >= 100) return 'full'
  return 'meta'
})

const prazoLabel = computed(() => {
  if (!props.meta.prazo) return 'sem prazo'
  const dias = diasAtePrazo(props.meta.prazo)
  if (dias === null) return 'sem prazo'
  if (dias < 0) return `vencida há ${Math.abs(dias)}d`
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  if (dias <= 30) return `vence em ${dias}d`
  // dd/mm
  const [, m, d] = props.meta.prazo.split('-')
  return `${d}/${m}`
})

const statsLine = computed(() => {
  const parts: string[] = []
  parts.push(`${props.progresso.feitas}/${props.progresso.total} ações concluídas`)
  parts.push(`${props.progresso.tarefasFeitas}/${props.progresso.totalT} tarefas diretas`)
  parts.push(`${props.progresso.projetosFeitos}/${props.progresso.totalP} projetos`)
  return parts.join(' · ')
})

const actions: ActionItem[] = [
  { key: 'edit', label: 'Editar', icon: 'pencil' },
  { key: 'arquivar', label: 'Arquivar', icon: 'archive', tone: 'warning' },
  { key: 'deletar', label: 'Apagar', icon: 'trash-2', tone: 'danger' },
]

function onHeadClick() {
  emit('toggle', props.meta.id)
}

function onAction(key: string) {
  if (key === 'edit') emit('edit', props.meta)
  else if (key === 'arquivar') emit('arquivar', props.meta)
  else if (key === 'deletar') emit('deletar', props.meta)
}
</script>

<template>
  <article
    class="meta-card"
    :class="[
      `is-status-${status}`,
      { 'is-expanded': expanded },
    ]"
  >
    <div class="m-head-row">
      <button
        type="button"
        class="m-head"
        :aria-expanded="expanded"
        :aria-controls="`meta-body-${meta.id}`"
        @click="onHeadClick"
      >
        <span class="m-dot" :style="{ background: dotColor }" />
        <span class="m-titulo">{{ meta.titulo }}</span>
        <span class="m-prazo" :class="{ 'is-vencida': status === 'vencida' }">
          {{ prazoLabel }}
        </span>
        <span class="m-pct">{{ progresso.pct }}%</span>
        <span class="m-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="m-action-slot" @click.stop>
        <BaseActionMenu
          :items="actions"
          aria-label="Ações da meta"
          @select="onAction"
        />
      </div>
    </div>

    <BaseProgressBar
      class="m-progress"
      :value="progresso.pct"
      :tone="progressTone"
      :height="3"
      :aria-label="`${progresso.pct}% concluído`"
    />

    <div
      v-show="expanded"
      :id="`meta-body-${meta.id}`"
      class="m-body"
    >
      <div class="m-stats-line">{{ statsLine }}</div>

      <p v-if="meta.descricao" class="m-desc">{{ meta.descricao }}</p>

      <slot name="projetos">
        <section class="m-section">
          <h4 class="m-section-h">Projetos vinculados</h4>
          <p class="m-empty-line">Nenhum projeto vinculado.</p>
        </section>
      </slot>

      <slot name="tarefas">
        <section class="m-section">
          <h4 class="m-section-h">Tarefas diretas da meta</h4>
          <p class="m-empty-line">Nenhuma tarefa direta.</p>
        </section>
      </slot>
    </div>
  </article>
</template>

<style scoped>
.meta-card {
  background: var(--color-surface);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--dur-base) var(--ease-spring),
              transform var(--dur-base) var(--ease-spring);
}

.meta-card:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-1px);
}

.m-head-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
}

.m-action-slot {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-base);
}
.meta-card:hover .m-action-slot,
.m-action-slot:focus-within {
  opacity: 1;
}
@media (max-width: 780px) {
  .m-action-slot {
    opacity: 1;
  }
}

.m-head {
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

.m-head:hover {
  background: var(--color-surface-hover);
}

.m-head:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong) inset;
}

.m-dot {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.m-titulo {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-14);
  font-weight: var(--fw-medium);
  color: var(--color-text);
}

.m-prazo {
  flex: 0 0 auto;
  font-size: var(--fs-11);
  color: var(--color-text-3);
  font-variant-numeric: tabular-nums;
}

.m-prazo.is-vencida {
  color: var(--color-danger);
  font-weight: var(--fw-medium);
}

.m-pct {
  flex: 0 0 auto;
  min-width: 36px;
  text-align: right;
  font-size: var(--fs-12);
  font-weight: var(--fw-semibold);
  color: var(--color-text-2);
  font-variant-numeric: tabular-nums;
}

.m-chevron {
  flex: 0 0 auto;
  font-size: var(--fs-11);
  color: var(--color-text-4);
  transition: transform var(--dur-base);
}

.is-expanded .m-chevron {
  transform: rotate(180deg);
}

.m-progress {
  border-radius: 0;
}

.m-body {
  padding: 10px 14px 14px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-alt);
}

.m-stats-line {
  font-size: var(--fs-11);
  color: var(--color-text-3);
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px;
}

.m-desc {
  margin: 0 0 12px;
  font-size: var(--fs-13);
  color: var(--color-text-2);
  line-height: var(--lh-relaxed);
  white-space: pre-wrap;
}

.m-section {
  margin-top: 6px;
}

.m-section-h {
  margin: 10px 0 6px;
  font-size: var(--fs-11);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-3);
}

.m-empty-line {
  margin: 0;
  padding: 6px 0;
  font-size: var(--fs-12);
  color: var(--color-text-4);
  font-style: italic;
}
</style>

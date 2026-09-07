<script setup lang="ts">
import type { ActionItem } from '#ui/types'
// NotaCard — per design-spec-comando.md §7.16
//
// Card colapsável: head clicável (toggle expand) com dot+titulo+meta,
// body com corpo + actions. O badge de projeto aparece quando ligada.

import { computed } from 'vue'
import type { Nota, TipoNota } from '~/types/nota'
import type { CategoriaProjeto, Projeto } from '~/types/projeto'
interface Props {
  nota: Nota
  projeto?: Projeto | null
  expanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  projeto: null,
  expanded: false,
})

const emit = defineEmits<{
  toggle: [id: string]
  edit: [nota: Nota]
  arquivar: [nota: Nota]
  deletar: [nota: Nota]
}>()

const TIPO_DOT_VAR: Record<TipoNota, string> = {
  Playbook: 'var(--color-nota-playbook)',
  Credencial: 'var(--color-nota-credencial)',
  Contato: 'var(--color-nota-contato)',
  Decisão: 'var(--color-nota-decisao)',
  Referência: 'var(--color-nota-referencia)',
}

const dotColor = computed(() => TIPO_DOT_VAR[props.nota.tipo])

const projetoTone = computed<CategoriaProjeto | undefined>(() =>
  props.projeto?.categoria,
)

const actions: ActionItem[] = [
  { key: 'edit', label: 'Editar', icon: 'pencil' },
  { key: 'arquivar', label: 'Arquivar', icon: 'archive', tone: 'warning' },
  { key: 'deletar', label: 'Apagar', icon: 'trash-2', tone: 'danger' },
]

function onHeadClick() {
  emit('toggle', props.nota.id)
}

function onAction(key: string) {
  if (key === 'edit') emit('edit', props.nota)
  else if (key === 'arquivar') emit('arquivar', props.nota)
  else if (key === 'deletar') emit('deletar', props.nota)
}
</script>

<template>
  <article class="nota" :class="{ 'is-expanded': expanded }">
    <div class="nota-head-row">
      <button
        type="button"
        class="nota-head"
        :aria-expanded="expanded"
        :aria-controls="`nota-body-${nota.id}`"
        @click="onHeadClick"
      >
        <span class="nota-dot" :style="{ background: dotColor }" />
        <span class="nota-titulo">{{ nota.titulo }}</span>
        <span class="nota-meta">
          <BaseBadge
            v-if="projeto"
            variant="projeto"
            :tone="projetoTone"
          >
            {{ projeto.nome }}
          </BaseBadge>
          <span class="nota-tipo">{{ nota.tipo }}</span>
          <span v-if="nota.status === 'Rascunho'" class="nota-rascunho">Rascunho</span>
        </span>
      </button>
      <div class="nota-action-slot" @click.stop>
        <BaseActionMenu
          :items="actions"
          aria-label="Ações da nota"
          @select="onAction"
        />
      </div>
    </div>

    <div
      v-show="expanded"
      :id="`nota-body-${nota.id}`"
      class="nota-body"
    >
      <div class="nota-corpo">{{ nota.corpo || 'Sem conteúdo.' }}</div>
    </div>
  </article>
</template>

<style scoped>
.nota {
  background: var(--color-surface);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--dur-base) var(--ease-spring),
              transform var(--dur-base) var(--ease-spring);
}

.nota:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-1px);
}

.nota-head-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
}

.nota-action-slot {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-base);
}
.nota:hover .nota-action-slot,
.nota-action-slot:focus-within {
  opacity: 1;
}
@media (max-width: 780px) {
  .nota-action-slot {
    opacity: 1;
  }
}

.nota-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
  color: var(--color-text);
  transition: background var(--dur-base);
}

.nota-head:hover {
  background: var(--color-surface-alt);
}

.nota-head:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong) inset;
}

.nota-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.nota-titulo {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-13);
  font-weight: var(--fw-medium);
  letter-spacing: var(--ls-body);
}

.nota-meta {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.nota-tipo {
  font-size: var(--fs-10);
  text-transform: uppercase;
  letter-spacing: var(--ls-uppercase-tight);
  font-weight: var(--fw-medium);
  color: var(--color-text-3);
}

.nota-rascunho {
  font-size: var(--fs-10);
  font-style: italic;
  color: var(--color-text-3);
  background: var(--color-surface-hover);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
}

.nota-body {
  padding: 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.nota-corpo {
  font-size: var(--fs-13);
  color: var(--color-text-2);
  line-height: var(--lh-relaxed);
  white-space: pre-wrap;
}
</style>

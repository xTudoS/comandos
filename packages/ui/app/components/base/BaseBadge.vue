<script setup lang="ts">
// BaseBadge — per design-spec-comando.md §6.2
//
// Engloba todas as badges do produto. Variant + tone determinam visual.

import BaseIcon from './BaseIcon.vue'

type Variant =
  | 'tipo'
  | 'projeto'
  | 'agenda'
  | 'followup'
  | 'delegado'
  | 'progress'
  | 'meta'
  | 'count'
  | 'kind'

type Tone =
  | 'ceo'
  | 'delego'
  | 'pessoal'
  | 'empresa'
  | 'produto'
  | 'geral'
  | 'default'

interface Props {
  variant: Variant
  tone?: Tone
  icon?: string
  active?: boolean // só aplicável a variant="count"
}

withDefaults(defineProps<Props>(), {
  tone: 'default',
  active: false,
})
</script>

<template>
  <span
    class="badge"
    :class="[`badge--${variant}`, tone ? `badge--tone-${tone}` : null, { 'is-active': active }]"
  >
    <BaseIcon v-if="variant === 'followup' && !icon" name="hourglass" :size="11" />
    <BaseIcon v-else-if="variant === 'meta' && !icon" name="target" :size="11" />
    <BaseIcon v-else-if="icon" :name="icon" :size="11" />
    <BaseIcon v-if="variant === 'delegado'" class="prefix" name="arrow-right" :size="11" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1;
}

/* === variant: tipo / followup / agenda / progress (oval 10px) === */

.badge--tipo,
.badge--followup,
.badge--agenda,
.badge--progress {
  border-radius: 10px;
  padding: 2px 8px;
  font-size: var(--fs-10);
  font-weight: var(--fw-semibold);
  letter-spacing: 0.03em;
}
.badge--tipo {
  text-transform: uppercase;
}

.badge--tone-ceo {
  background: var(--color-ceo-bg);
  color: var(--color-ceo-fg);
}
.badge--tone-delego {
  background: var(--color-delego-bg);
  color: var(--color-delego-fg);
}
.badge--tone-pessoal {
  background: var(--color-pessoal-bg);
  color: var(--color-pessoal-fg);
}

.badge--agenda {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.badge--followup {
  background: var(--color-followup-bg);
  color: var(--color-followup-fg);
}
.badge--progress {
  background: var(--color-surface-alt);
  color: var(--color-text-2);
  border: 1px solid var(--color-border);
  font-weight: var(--fw-semibold);
}

/* === variant: delegado === */

.badge--delegado {
  background: var(--color-delego-bg);
  color: var(--color-delego-fg);
  border-radius: 10px;
  padding: 2px 8px;
  font-size: var(--fs-10);
  font-weight: var(--fw-medium);
}
.badge--delegado .prefix {
  opacity: 0.7;
}

/* === variant: projeto (badge retangular pequena) === */

.badge--projeto {
  border-radius: 4px;
  padding: 2px 6px;
  font-size: var(--fs-10);
  font-weight: var(--fw-medium);
  border: 1px solid transparent;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
.badge--projeto.badge--tone-empresa {
  background: var(--color-proj-empresa-bg);
  color: var(--color-proj-empresa-fg);
  border-color: var(--color-proj-empresa-bd);
}
.badge--projeto.badge--tone-produto {
  background: var(--color-proj-produto-bg);
  color: var(--color-proj-produto-fg);
  border-color: var(--color-proj-produto-bd);
}
.badge--projeto.badge--tone-geral {
  background: var(--color-proj-geral-bg);
  color: var(--color-proj-geral-fg);
  border-color: var(--color-proj-geral-bd);
}
.badge--projeto.badge--tone-pessoal {
  background: var(--color-proj-pessoal-bg);
  color: var(--color-proj-pessoal-fg);
  border-color: var(--color-proj-pessoal-bd);
}

/* === variant: meta (azul iOS, retangular pequena) === */

.badge--meta {
  background: rgba(10, 132, 255, 0.12);
  color: var(--color-meta-from);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: var(--fs-10);
  font-weight: var(--fw-medium);
}

/* === variant: count (em tab-main e horizonte-head) === */

.badge--count {
  background: var(--color-surface-hover);
  color: var(--color-text-2);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: var(--fs-10);
  font-weight: var(--fw-medium);
}
.badge--count.is-active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

/* === variant: kind (em arquivo) === */

.badge--kind {
  background: var(--color-surface-alt);
  color: var(--color-text-3);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: var(--fs-10);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>

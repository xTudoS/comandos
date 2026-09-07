<script setup lang="ts">
// BaseTooltip — per design-spec-comando.md §6.11
//
// Single instance global. Renderizada UMA vez em layouts/default.vue.
// Estado vem de useTooltip(). Posição é position: fixed.

import { useTooltip } from '../../composables/useTooltip'

const { state } = useTooltip()
</script>

<template>
  <Teleport to="body">
    <Transition name="tt">
      <div
        v-if="state.visible"
        class="tt"
        role="tooltip"
        :style="{ left: state.x + 'px', top: state.y + 'px' }"
      >
        <div
          v-if="state.content.time"
          class="tt__time"
          :class="{ 'is-fup': state.content.variant === 'fup' }"
        >
          {{ state.content.time }}
        </div>
        <div v-if="state.content.titulo" class="tt__titulo">
          {{ state.content.titulo }}
        </div>
        <div v-if="state.content.desc" class="tt__desc">
          {{ state.content.desc }}
        </div>
        <div v-if="state.content.chips && state.content.chips.length" class="tt__meta">
          <span
            v-for="(c, i) in state.content.chips"
            :key="i"
            class="tt__chip"
            :class="c.tone ? `tt__chip--${c.tone}` : null"
          >
            {{ c.label }}
          </span>
        </div>
        <div v-if="state.content.hint" class="tt__hint">{{ state.content.hint }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tt {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  padding: 12px 14px;
  max-width: 320px;
  min-width: 200px;
  z-index: 1000;
  pointer-events: none;
  font-family: var(--font);
}

.tt__time {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent);
  margin-bottom: 4px;
}
.tt__time.is-fup {
  color: var(--warning);
}

.tt__titulo {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text);
  margin-bottom: 6px;
}

.tt__desc {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 120px;
  overflow: hidden;
}

.tt__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.tt__chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--surface-alt);
  color: var(--text-2);
  border: 1px solid var(--border);
  font-weight: 500;
}
.tt__chip--accent {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: transparent;
}
.tt__chip--warning {
  background: var(--followup-bg);
  color: var(--followup-fg);
  border-color: transparent;
}
.tt__chip--success {
  background: var(--delego-bg);
  color: var(--delego-fg);
  border-color: transparent;
}
.tt__chip--danger {
  background: var(--ceo-bg);
  color: var(--ceo-fg);
  border-color: transparent;
}

.tt__hint {
  font-size: 10px;
  font-style: italic;
  color: var(--text-4);
  margin-top: 6px;
}

.tt-enter-active,
.tt-leave-active {
  transition: opacity var(--dur-fast);
}
.tt-enter-from,
.tt-leave-to {
  opacity: 0;
}
</style>

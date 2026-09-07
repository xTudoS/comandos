<script setup lang="ts">
// AppToast — per design-spec-comando.md §8.5
//
// Single instance. Renderizar UMA vez em layouts/default.vue.

import { useToast } from '~/composables/useToast'

const { state } = useToast()
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="state.visible"
        class="toast"
        role="status"
        aria-live="polite"
      >
        {{ state.message }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-text);
  color: var(--color-surface);
  padding: 12px 20px;
  border-radius: var(--radius-pill);
  font-size: var(--fs-13);
  font-weight: var(--fw-medium);
  font-family: var(--font-sans);
  box-shadow: var(--shadow-lg);
  z-index: 200;
  max-width: calc(100vw - 40px);
  text-align: center;
  pointer-events: none;
}

/* spec §14: enter translateY(20) → 0, opacity 0 → 1 em 200ms */
.toast-enter-active {
  transition:
    opacity var(--dur-medium),
    transform var(--dur-medium) var(--easing-default);
}
.toast-leave-active {
  transition:
    opacity var(--dur-base),
    transform var(--dur-base);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}

/* iOS notches */
@media (max-width: 780px) {
  .toast {
    bottom: calc(80px + env(safe-area-inset-bottom));
  }
}
</style>

<script setup lang="ts">
// BaseButton — per design-spec-comando.md §6.1

import BaseIcon from './BaseIcon.vue'

type Variant = 'primary' | 'ghost' | 'danger' | 'warning'
type Size = 'md' | 'sm' | 'icon-sm' | 'icon-md'

interface Props {
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  iconLeft?: string
  iconRight?: string
  ariaLabel?: string
}

withDefaults(defineProps<Props>(), {
  variant: 'ghost',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :aria-busy="loading || undefined"
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`]"
  >
    <BaseIcon v-if="iconLeft" :name="iconLeft" :size="14" />
    <span v-if="$slots.default" class="btn__label"><slot /></span>
    <BaseIcon v-if="iconRight" :name="iconRight" :size="14" />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-6);
  border-radius: var(--radius);
  font-size: var(--fs-13);
  font-weight: var(--fw-medium);
  line-height: 1;
  white-space: nowrap;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition:
    background var(--dur-base),
    border-color var(--dur-base),
    color var(--dur-base),
    transform var(--dur-instant);
  font-family: var(--font-sans);
}

.btn:disabled,
.btn[aria-busy="true"] {
  cursor: not-allowed;
  opacity: 0.55;
}

.btn:active:not(:disabled):not([aria-busy="true"]) {
  transform: scale(0.97);
}

.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}

/* === variants === */

.btn--primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}
.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}
.btn--primary:active:not(:disabled) {
  background: var(--primary-pressed);
  border-color: var(--primary-pressed);
}

.btn--ghost {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border-strong);
}
.btn--ghost:hover:not(:disabled) {
  background: var(--color-surface-hover);
}

.btn--danger {
  background: transparent;
  color: var(--color-danger);
  border-color: var(--color-danger);
}
.btn--danger:hover:not(:disabled) {
  background: #fdebec;
}

.btn--warning {
  background: transparent;
  color: var(--color-warning);
  border-color: var(--color-warning);
}
.btn--warning:hover:not(:disabled) {
  background: #fef3e6;
}

/* === sizes === */

.btn--sm {
  font-size: var(--fs-12);
  padding: 5px var(--sp-4);
  border-radius: var(--radius-sm);
}

.btn--icon-sm,
.btn--icon-md {
  padding: 0;
  border-radius: 50%;
  flex: 0 0 auto;
}
.btn--icon-sm {
  width: 22px;
  height: 22px;
}
.btn--icon-md {
  width: 28px;
  height: 28px;
}

/* On mobile, ensure icon buttons hit ≥44px touch target — spec §12 A10. */
@media (max-width: 780px) {
  .btn--icon-sm,
  .btn--icon-md {
    width: 44px;
    height: 44px;
  }
}

.btn__label {
  display: inline-block;
}
</style>

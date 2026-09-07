<script setup lang="ts">
// BaseCheckboxSquare — per design-spec-comando.md §6.6
//
// Check quadrado (checklist). 14×14 / radius 4px (--radius-xs; era 3px antes de
// a escala de radius ser fechada). Strike-through aplicado
// pelo consumidor no <span> irmão.

interface Props {
  modelValue: boolean
  ariaLabel?: string
  disabled?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  toggle: []
}>()

function onClick(_e: MouseEvent, current: boolean) {
  emit('update:modelValue', !current)
  emit('toggle')
}
</script>

<template>
  <button
    type="button"
    class="check-sq"
    :class="{ 'is-done': modelValue }"
    :aria-pressed="modelValue"
    :aria-label="ariaLabel ?? (modelValue ? 'Marcado' : 'Não marcado')"
    :disabled="disabled"
    @click="onClick($event, modelValue)"
  />
</template>

<style scoped>
.check-sq {
  position: relative;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1.5px solid var(--color-border-strong);
  background: transparent;
  cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast);
  flex: 0 0 auto;
  padding: 0;
}

.check-sq:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.check-sq.is-done {
  background: var(--color-success);
  border-color: var(--color-success);
}

.check-sq.is-done::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 4px;
  border: 1.5px solid var(--accent-fg);
  border-top: 0;
  border-right: 0;
  transform: translate(-50%, -55%) rotate(-45deg);
}

.check-sq:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}

.check-sq:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

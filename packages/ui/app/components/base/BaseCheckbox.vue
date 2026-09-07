<script setup lang="ts">
// BaseCheckbox — per design-spec-comando.md §6.5
//
// Check redondo (.task .check). 18×18, verde quando done.

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
    class="check"
    :class="{ 'is-done': modelValue }"
    :aria-pressed="modelValue"
    :aria-label="ariaLabel ?? (modelValue ? 'Marcado' : 'Não marcado')"
    :disabled="disabled"
    @click="onClick($event, modelValue)"
  />
</template>

<style scoped>
.check {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border-strong);
  background: transparent;
  cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast);
  flex: 0 0 auto;
  padding: 0;
}

.check:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.check.is-done {
  background: var(--color-success);
  border-color: var(--color-success);
}

.check.is-done::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 9px;
  height: 5px;
  border: 1.5px solid var(--accent-fg);
  border-top: 0;
  border-right: 0;
  transform: translate(-50%, -50%) rotate(-45deg) translate(0px, -1px);
}

.check:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}

.check:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

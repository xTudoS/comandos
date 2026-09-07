<script setup lang="ts">
const props = defineProps<{
  size?: 'sm' | 'md'
  variant?: 'default' | 'success'
  ariaLabel?: string
  disabled?: boolean
}>()

const model = defineModel<boolean>({ default: false })

function toggle() {
  if (props.disabled) return
  model.value = !model.value
}
</script>

<template>
  <button
    type="button"
    class="circle-check"
    :class="[
      `size-${size ?? 'md'}`,
      `variant-${variant ?? 'default'}`,
      { on: model, disabled },
    ]"
    :aria-pressed="model"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click.stop="toggle"
  >
    <BaseIcon v-if="model" name="check" class="ic" />
  </button>
</template>

<style scoped>
.circle-check {
  --s: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--s);
  height: var(--s);
  flex-shrink: 0;
  border-radius: 999px;
  background: transparent;
  border: 1.5px solid var(--border-strong);
  color: transparent;
  cursor: pointer;
  padding: 0;
  transition:
    background var(--dur-fast) var(--ease-spring),
    border-color var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
}
.size-sm {
  --s: 18px;
}
.size-md {
  --s: 22px;
}
.circle-check:hover:not(.disabled):not(.on) {
  border-color: var(--accent);
}
.circle-check.on {
  border-color: transparent;
  color: white;
}
.circle-check.on.variant-default {
  background: var(--accent);
}
.circle-check.on.variant-success {
  background: var(--success);
}
.circle-check.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.circle-check:active:not(.disabled) {
  transform: scale(0.9);
}
.ic {
  width: 65%;
  height: 65%;
  stroke-width: 3;
}
.circle-check:focus-visible {
  box-shadow: var(--shadow-focus);
}
</style>

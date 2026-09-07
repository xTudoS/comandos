<script setup lang="ts">
const props = defineProps<{
  size?: 'sm' | 'md'
  disabled?: boolean
  ariaLabel?: string
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
    class="ios-toggle"
    :class="[`size-${size ?? 'md'}`, { on: model, disabled }]"
    :aria-pressed="model"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click.stop="toggle"
  >
    <span class="knob" aria-hidden="true" />
  </button>
</template>

<style scoped>
.ios-toggle {
  --w: 51px;
  --h: 31px;
  --pad: 2px;
  position: relative;
  width: var(--w);
  height: var(--h);
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 16%, transparent);
  border: none;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background var(--dur-base) var(--ease-spring);
  display: inline-flex;
  align-items: center;
}
.ios-toggle.size-sm {
  --w: 42px;
  --h: 26px;
}
.ios-toggle.on {
  background: var(--success);
}
.ios-toggle.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.knob {
  position: absolute;
  top: var(--pad);
  left: var(--pad);
  width: calc(var(--h) - var(--pad) * 2);
  height: calc(var(--h) - var(--pad) * 2);
  background: var(--surface);
  border-radius: 999px;
  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.15),
    0 1px 2px rgba(0, 0, 0, 0.1),
    0 0 0 0.5px rgba(0, 0, 0, 0.04);
  transition:
    transform var(--dur-base) var(--ease-spring),
    width var(--dur-base) var(--ease-spring);
}
.ios-toggle.on .knob {
  transform: translateX(calc(var(--w) - var(--h)));
}
.ios-toggle:active:not(.disabled) {
  transform: none;
}
.ios-toggle:active:not(.disabled) .knob {
  width: calc(var(--h) - var(--pad) * 2 + 4px);
}
.ios-toggle.on:active:not(.disabled) .knob {
  transform: translateX(calc(var(--w) - var(--h) - 4px));
}
.ios-toggle:focus-visible {
  box-shadow: var(--shadow-focus);
}
</style>

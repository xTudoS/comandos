<script setup lang="ts">
// BaseToggle — per design-spec-comando.md §6.4
//
// Switch iOS-style. Usado em followup-section. Suporta tone "warning" (ON
// vira amber) ou "accent" (ON vira azul).

interface Props {
  modelValue: boolean
  label?: string
  sub?: string
  tone?: 'warning' | 'accent'
  disabled?: boolean
  ariaLabel?: string
}

withDefaults(defineProps<Props>(), {
  tone: 'accent',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <label class="toggle" :class="[`toggle--${tone}`, { 'is-on': modelValue, 'is-disabled': disabled }]">
    <span v-if="label || sub" class="toggle__text">
      <span v-if="label" class="toggle__label">{{ label }}</span>
      <span v-if="sub" class="toggle__sub">{{ sub }}</span>
    </span>
    <span class="toggle__switch" role="switch" :aria-checked="modelValue" :aria-label="ariaLabel">
      <input
        type="checkbox"
        :checked="modelValue"
        :disabled="disabled"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <span class="toggle__track">
        <span class="toggle__knob" />
      </span>
    </span>
  </label>
</template>

<style scoped>
.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-5);
  cursor: pointer;
  user-select: none;
}

.toggle.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.toggle__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.toggle__label {
  font-size: var(--fs-13);
  font-weight: var(--fw-medium);
  color: var(--color-text);
}

.toggle__sub {
  font-size: var(--fs-11);
  color: var(--color-text-3);
}

.toggle__switch {
  position: relative;
  width: 36px;
  height: 20px;
  flex: 0 0 auto;
}

.toggle__switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  margin: 0;
  cursor: inherit;
}

.toggle__track {
  position: absolute;
  inset: 0;
  background: var(--color-border-strong);
  border-radius: 10px;
  transition: background var(--dur-base);
}

.toggle__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--surface);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform var(--dur-base);
}

.toggle.is-on .toggle__knob {
  transform: translateX(16px);
}

.toggle.is-on.toggle--warning .toggle__track {
  background: var(--color-warning);
}
.toggle.is-on.toggle--accent .toggle__track {
  background: var(--color-accent);
}
</style>

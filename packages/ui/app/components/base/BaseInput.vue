<script setup lang="ts">
// BaseInput — per design-spec-comando.md §6.3

import BaseIcon from './BaseIcon.vue'

type Variant = 'default' | 'search' | 'flat'

interface Props {
  modelValue: string | number | null | undefined
  variant?: Variant
  type?: 'text' | 'date' | 'time' | 'number' | 'email' | 'url' | 'tel' | 'password'
  placeholder?: string
  list?: string
  inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'search' | 'email' | 'url'
  autofocus?: boolean
  step?: string | number
  min?: string | number
  max?: string | number
  disabled?: boolean
  readonly?: boolean
  ariaLabel?: string
  searchIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  type: 'text',
  searchIcon: 'search',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: [value: string]
  blur: [value: string]
}>()

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    emit('enter', (e.target as HTMLInputElement).value)
  }
}
function onBlur(e: FocusEvent) {
  emit('blur', (e.target as HTMLInputElement).value)
}

defineExpose({
  focus: () => {
    // Caller pode pegar via template ref e chamar focus().
    // Implementação delegada ao <input> nativo via ref interno.
  },
})
</script>

<template>
  <div class="input-wrap" :class="`input-wrap--${variant}`">
    <span v-if="variant === 'search'" class="input-prefix">
      <BaseIcon :name="searchIcon" :size="14" />
    </span>
    <input
      class="input"
      :class="`input--${variant}`"
      :value="modelValue ?? ''"
      :type="type"
      :placeholder="placeholder"
      :list="list"
      :inputmode="inputmode"
      :autofocus="autofocus"
      :step="step"
      :min="min"
      :max="max"
      :disabled="disabled"
      :readonly="readonly"
      :aria-label="ariaLabel"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
  </div>
</template>

<style scoped>
.input-wrap {
  position: relative;
  display: block;
}

.input {
  display: block;
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  padding: var(--sp-3) var(--sp-4);
  font-size: var(--fs-14);
  color: var(--color-text);
  font-family: var(--font-sans);
  line-height: 1.4;
  transition:
    border-color var(--dur-base),
    box-shadow var(--dur-base);
}

.input::placeholder {
  color: var(--color-text-4);
}

.input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
  outline: none;
}

.input:disabled {
  background: var(--color-surface-alt);
  color: var(--color-text-4);
  cursor: not-allowed;
}

/* === variant: search === */

.input-wrap--search .input {
  padding: 6px var(--sp-4) 6px 30px;
  font-size: var(--fs-13);
}

.input-prefix {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  color: var(--color-text-3);
  pointer-events: none;
  display: inline-flex;
}

/* === variant: flat (inbox / quick-add) === */

.input--flat {
  background: var(--color-surface-alt);
  border-color: var(--color-border);
}
.input--flat:focus {
  background: var(--color-surface);
  border-color: var(--color-accent);
}
</style>

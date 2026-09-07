<script setup lang="ts">
// BaseTextarea — per design-spec-comando.md §6.3

interface Props {
  modelValue: string | null | undefined
  placeholder?: string
  rows?: number
  disabled?: boolean
  readonly?: boolean
  ariaLabel?: string
  flat?: boolean
}

withDefaults(defineProps<Props>(), {
  rows: 4,
  flat: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [value: string]
}>()

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}
function onBlur(e: FocusEvent) {
  emit('blur', (e.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <textarea
    class="textarea"
    :class="{ 'textarea--flat': flat }"
    :value="modelValue ?? ''"
    :placeholder="placeholder"
    :rows="rows"
    :disabled="disabled"
    :readonly="readonly"
    :aria-label="ariaLabel"
    @input="onInput"
    @blur="onBlur"
  />
</template>

<style scoped>
.textarea {
  display: block;
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  padding: var(--sp-3) var(--sp-4);
  font-size: var(--fs-14);
  color: var(--color-text);
  font-family: var(--font-sans);
  line-height: 1.5;
  resize: vertical;
  min-height: 80px;
  transition:
    border-color var(--dur-base),
    box-shadow var(--dur-base);
}

.textarea::placeholder {
  color: var(--color-text-4);
}

.textarea:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
  outline: none;
}

.textarea--flat {
  background: var(--color-surface-alt);
  border-color: var(--color-border);
}
.textarea--flat:focus {
  background: var(--color-surface);
}
</style>

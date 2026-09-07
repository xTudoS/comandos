<script setup lang="ts">
// BaseSelect — per design-spec-comando.md §6.3
//
// Suporta agrupamento (renderProjetosSelect agrupa por categoria) via slot
// default — caller passa <option> e <optgroup> como achar melhor.
//
// Para casos simples, prop `options` aceita lista plana ou agrupada.

export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

interface Props {
  modelValue: string | number | null | undefined
  options?: SelectOption[] | SelectGroup[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}

withDefaults(defineProps<Props>(), {
  options: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

function onChange(e: Event) {
  emit('update:modelValue', (e.target as HTMLSelectElement).value)
}

function isGroup(o: SelectOption | SelectGroup): o is SelectGroup {
  return Array.isArray((o as SelectGroup).options)
}
</script>

<template>
  <select
    class="select"
    :value="modelValue ?? ''"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @change="onChange"
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <slot>
      <template v-for="(opt, i) in options" :key="i">
        <optgroup v-if="isGroup(opt)" :label="opt.label">
          <option
            v-for="o in opt.options"
            :key="String(o.value)"
            :value="o.value"
            :disabled="o.disabled"
          >
            {{ o.label }}
          </option>
        </optgroup>
        <option
          v-else
          :value="opt.value"
          :disabled="opt.disabled"
        >
          {{ opt.label }}
        </option>
      </template>
    </slot>
  </select>
</template>

<style scoped>
.select {
  display: block;
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  padding: var(--sp-3) 30px var(--sp-3) var(--sp-4);
  font-size: var(--fs-14);
  color: var(--color-text);
  font-family: var(--font-sans);
  line-height: 1.4;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2386868b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px;
  transition:
    border-color var(--dur-base),
    box-shadow var(--dur-base);
}

.select:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
  outline: none;
}

.select:disabled {
  background-color: var(--color-surface-alt);
  color: var(--color-text-4);
  cursor: not-allowed;
}
</style>

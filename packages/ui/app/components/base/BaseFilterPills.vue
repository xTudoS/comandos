<script setup lang="ts">
// BaseFilterPills — per design-spec-comando.md §6.8
//
// Pílulas de filtro. Usada em /notas, /projetos, /metas, /pagamentos, /arquivo.

interface Option {
  value: string
  label: string
  /** Optional badge count exibido após o label. */
  count?: number
}

interface Props {
  modelValue: string
  options: Option[]
  ariaLabel?: string
}

defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="pills" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === o.value"
      class="pill"
      :class="{ 'is-active': modelValue === o.value }"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
      <span v-if="typeof o.count === 'number'" class="pill__count">{{ o.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: var(--fs-12);
  font-weight: var(--fw-medium);
  font-family: var(--font-sans);
  background: var(--color-surface);
  color: var(--color-text-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition:
    background var(--dur-base),
    color var(--dur-base),
    border-color var(--dur-base),
    box-shadow var(--dur-base);
}

.pill:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-strong);
}

.pill.is-active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.pill:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}

.pill__count {
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-10);
  opacity: 0.8;
}
</style>

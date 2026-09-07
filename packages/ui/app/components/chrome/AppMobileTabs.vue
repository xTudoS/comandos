<script setup lang="ts">
// AppMobileTabs — per design-spec-comando.md §8.6
//
// Bottom-nav (≤780px) usado dentro da view /trabalho para alternar painéis.
// Limite de 4 itens (recomendação UX bottom-nav).

interface TabItem {
  value: string
  label: string
  /** Optional icon name (Lucide). Spec usa só texto, mas damos suporte. */
  icon?: string
}

interface Props {
  modelValue: string
  items: TabItem[]
  ariaLabel?: string
}

defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <nav class="mobile-tabs" role="tablist" :aria-label="ariaLabel ?? 'Painéis'">
    <button
      v-for="t in items"
      :key="t.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === t.value"
      class="mtab"
      :class="{ 'is-active': modelValue === t.value }"
      @click="emit('update:modelValue', t.value)"
    >
      {{ t.label }}
    </button>
  </nav>
</template>

<style scoped>
.mobile-tabs {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid var(--color-border);
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: space-around;
  z-index: 20;
  font-family: var(--font-sans);
}

.mtab {
  flex: 1;
  padding: 8px 4px;
  font-size: var(--fs-11);
  font-weight: var(--fw-medium);
  color: var(--color-text-3);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  transition: background var(--dur-base), color var(--dur-base);
  min-height: 44px; /* spec §12 A10 */
}

.mtab:hover {
  background: var(--color-surface-hover);
}

.mtab.is-active {
  background: var(--color-surface-hover);
  color: var(--color-accent);
}

/* Hidden on tablet+ */
@media (min-width: 781px) {
  .mobile-tabs {
    display: none;
  }
}
</style>

<script setup lang="ts" generic="T extends string">
type Tab = { value: T; label: string; icon?: string }

defineProps<{ tabs: Tab[]; ariaLabel?: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="view-tabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="t in tabs"
      :key="t.value"
      type="button"
      role="tab"
      class="vt-item"
      :class="{ active: model === t.value }"
      :aria-selected="model === t.value"
      @click="model = t.value"
    >
      <BaseIcon v-if="t.icon" :name="t.icon" :size="15" class="vt-ic" />
      <span>{{ t.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.view-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: color-mix(in srgb, var(--text) 5%, transparent);
  border-radius: var(--radius-md);
  padding: 4px;
  max-width: 100%;
  min-width: 0;
}
/* No mobile, com muitas abas, é melhor quebrar em várias linhas do que rolar. */
@media (max-width: 720px) {
  .view-tabs {
    flex-wrap: wrap;
  }
  .vt-item {
    flex: 1 1 auto;
    justify-content: center;
  }
}
.vt-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  background: transparent;
  white-space: nowrap;
  transition:
    color var(--dur-fast) var(--ease-spring),
    background var(--dur-fast) var(--ease-spring);
}
.vt-item:hover:not(.active) {
  color: var(--text);
}
.vt-ic {
  opacity: 0.8;
}
.vt-item.active {
  color: var(--text);
  font-weight: 600;
  background: var(--surface);
  box-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.05),
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 3px 8px -3px rgba(0, 0, 0, 0.1);
}
</style>

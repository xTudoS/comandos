<script setup lang="ts">
defineProps<{
  title: string
  desc?: string
}>()
</script>

<template>
  <header class="page-head">
    <div class="titles">
      <h1>{{ title }}</h1>
      <p v-if="desc" class="desc">{{ desc }}</p>
    </div>
    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.titles h1 {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.022em;
  line-height: 1.15;
  color: var(--text);
}
.titles .desc {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-3);
  margin-top: 8px;
  max-width: 62ch;
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .page-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

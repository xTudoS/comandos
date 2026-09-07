<script setup lang="ts">
// Page hero: title + description on the left, avatar stack / actions on the right.
defineProps<{
  title: string
  description?: string
  people?: { name: string }[]
}>()
</script>

<template>
  <header class="page-hero">
    <div class="ph-text">
      <h1 class="ph-title">{{ title }}</h1>
      <p v-if="description" class="ph-desc">{{ description }}</p>
      <slot name="below" />
    </div>
    <div class="ph-trailing">
      <slot name="actions" />
      <AvatarStack
        v-if="people && people.length"
        :people="people"
        :max="4"
        :size="32"
        show-add
      />
    </div>
  </header>
</template>

<style scoped>
.page-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 4px 0 2px;
}
.ph-text {
  min-width: 0;
}
.ph-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.022em;
  color: var(--text);
  margin: 0;
  line-height: 1.15;
}
.ph-desc {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-3);
  max-width: 62ch;
}
.ph-trailing {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding-top: 4px;
}
@media (max-width: 640px) {
  .ph-title {
    font-size: 22px;
  }
}
</style>

<script setup lang="ts">
// BaseEmptyState — per design-spec-comando.md §6.9

import BaseIcon from './BaseIcon.vue'

interface Props {
  icon?: string
  message?: string
  big?: boolean
}

withDefaults(defineProps<Props>(), {
  big: false,
})
</script>

<template>
  <div class="empty" :class="{ 'empty--big': big }">
    <BaseIcon v-if="icon" :name="icon" :size="big ? 32 : 24" class="empty__icon" />
    <div v-if="message || $slots.default" class="empty__msg">
      <slot>{{ message }}</slot>
    </div>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-3);
  font-size: var(--fs-13);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty--big {
  padding: 50px 20px;
  font-size: var(--fs-14);
}

.empty__icon {
  opacity: 0.5;
  color: currentColor;
}

.empty__msg {
  line-height: 1.5;
}
</style>

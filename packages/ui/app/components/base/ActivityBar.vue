<script setup lang="ts">
// Gradient activity bar with density stripes (task-status widget).
// `values` are 0..1 intensities mapped to stripe opacity.
const props = withDefaults(
  defineProps<{
    values: number[]
    from?: string
    to?: string
    height?: number
  }>(),
  {
    from: '#6e6ae6',
    to: '#c9b6f5',
    height: 76,
  },
)

const grad = computed(
  () => `linear-gradient(90deg, ${props.from}, ${props.to})`,
)
</script>

<template>
  <div
    class="activity-bar"
    :style="{ height: `${height}px`, background: grad }"
    aria-hidden="true"
  >
    <span
      v-for="(v, i) in values"
      :key="i"
      class="ab-stripe"
      :style="{ opacity: 0.12 + Math.min(1, Math.max(0, v)) * 0.55 }"
    />
  </div>
</template>

<style scoped>
.activity-bar {
  display: flex;
  width: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
}
.ab-stripe {
  flex: 1;
  background: var(--surface);
}
</style>

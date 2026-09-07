<script setup lang="ts">
// Mini bar chart (e.g. commits / volume). Highlighted bars use accent color.
const props = withDefaults(
  defineProps<{
    values: number[]
    highlight?: number[]
    color?: string
    accent?: string
    height?: number
  }>(),
  {
    color: 'var(--border-strong)',
    accent: 'var(--warning)',
    height: 60,
  },
)

const max = computed(() => Math.max(...props.values, 1))
function isHi(i: number) {
  return props.highlight?.includes(i)
}
</script>

<template>
  <div class="spark-bars" :style="{ height: `${height}px` }" aria-hidden="true">
    <span
      v-for="(v, i) in values"
      :key="i"
      class="sb-bar"
      :style="{
        height: `${Math.max(8, (v / max) * 100)}%`,
        background: isHi(i) ? accent : color,
      }"
    />
  </div>
</template>

<style scoped>
.spark-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  width: 100%;
}
.sb-bar {
  flex: 1;
  min-width: 2px;
  border-radius: 4px;
  transition: height var(--dur-base) var(--ease-spring);
}
</style>

<script setup lang="ts">
// Delta indicator: arrow + percentage + period (matches reference).
const props = withDefaults(
  defineProps<{
    value: number // signed percentage
    period?: string
    goodWhen?: 'up' | 'down'
  }>(),
  { goodWhen: 'up' },
)

const up = computed(() => props.value >= 0)
const good = computed(() =>
  props.goodWhen === 'up' ? up.value : !up.value,
)
</script>

<template>
  <span class="delta" :class="good ? 'good' : 'bad'">
    <BaseIcon :name="up ? 'arrow-up-right' : 'arrow-down-right'" :size="14" />
    <span class="delta-val">{{ Math.abs(value).toFixed(1) }}%</span>
    <span v-if="period" class="delta-period">({{ period }})</span>
  </span>
</template>

<style scoped>
.delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.delta.good {
  color: var(--success);
}
.delta.bad {
  color: var(--danger);
}
.delta-period {
  color: var(--text-4);
  font-weight: 500;
}
</style>

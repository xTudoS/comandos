<script setup lang="ts">
// Mini scatter plot with trend line (e.g. comments correlation).
const props = withDefaults(
  defineProps<{
    points: { x: number; y: number }[]
    colors?: string[]
    height?: number
  }>(),
  { height: 70 },
)

const W = 200
const PAD = 6

const palette = computed(
  () => props.colors ?? ['var(--accent)', 'var(--micro-bar)', 'var(--warning)'],
)

const mapped = computed(() => {
  const xs = props.points.map((p) => p.x)
  const ys = props.points.map((p) => p.y)
  const xlo = Math.min(...xs, 0)
  const xhi = Math.max(...xs, 1)
  const ylo = Math.min(...ys, 0)
  const yhi = Math.max(...ys, 1)
  const H = props.height
  return props.points.map((p, i) => ({
    cx: PAD + ((p.x - xlo) / (xhi - xlo || 1)) * (W - PAD * 2),
    cy: PAD + (1 - (p.y - ylo) / (yhi - ylo || 1)) * (H - PAD * 2),
    color: palette.value[i % palette.value.length],
  }))
})
</script>

<template>
  <svg
    class="spark-scatter"
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    role="img"
    aria-hidden="true"
  >
    <line
      :x1="PAD"
      :y1="height - PAD"
      :x2="W - PAD"
      :y2="PAD"
      stroke="var(--border-strong)"
      stroke-width="1"
      stroke-dasharray="3 3"
      vector-effect="non-scaling-stroke"
    />
    <circle
      v-for="(p, i) in mapped"
      :key="i"
      :cx="p.cx"
      :cy="p.cy"
      r="2.4"
      :fill="p.color"
    />
  </svg>
</template>

<style scoped>
.spark-scatter {
  width: 100%;
  height: 100%;
  display: block;
}
</style>

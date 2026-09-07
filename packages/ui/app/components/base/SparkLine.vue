<script setup lang="ts">
// Mini area/line chart (burndown / trend). Dependency-free SVG.
type Series = { points: number[]; color: string; fill?: boolean }

const props = withDefaults(
  defineProps<{
    series: Series[]
    height?: number
    min?: number
    max?: number
  }>(),
  { height: 96 },
)

const W = 300
const PAD = 4

const bounds = computed(() => {
  const all = props.series.flatMap((s) => s.points)
  const lo = props.min ?? Math.min(...all, 0)
  const hi = props.max ?? Math.max(...all, 1)
  return { lo, hi: hi === lo ? lo + 1 : hi }
})

function path(points: number[]) {
  const { lo, hi } = bounds.value
  const n = points.length
  if (n === 0) return ''
  const H = props.height
  return points
    .map((v, i) => {
      const x = PAD + (i / Math.max(1, n - 1)) * (W - PAD * 2)
      const y = PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function areaPath(points: number[]) {
  const d = path(points)
  if (!d) return ''
  const H = props.height
  return `${d} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`
}

const uid = Math.random().toString(36).slice(2, 8)
</script>

<template>
  <svg
    class="spark-line"
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    role="img"
    aria-hidden="true"
  >
    <defs>
      <linearGradient
        v-for="(s, i) in series"
        :id="`sl-${uid}-${i}`"
        :key="i"
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        <stop offset="0%" :stop-color="s.color" stop-opacity="0.18" />
        <stop offset="100%" :stop-color="s.color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <template v-for="(s, i) in series" :key="i">
      <path
        v-if="s.fill"
        :d="areaPath(s.points)"
        :fill="`url(#sl-${uid}-${i})`"
        stroke="none"
      />
      <path
        :d="path(s.points)"
        fill="none"
        :stroke="s.color"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </template>
  </svg>
</template>

<style scoped>
.spark-line {
  width: 100%;
  height: 100%;
  display: block;
}
</style>

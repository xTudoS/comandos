<script setup lang="ts">
import { computed, onMounted } from 'vue'

const {
  state,
  ensureLoaded,
  overallScore,
  alertedAreas,
  weakestInsight,
} = useLifeTracker()

const { list: taskList, refresh: refreshTasks } = useTasks()

onMounted(() => {
  ensureLoaded()
  if (taskList.value.length === 0) void refreshTasks()
})

const RING_R = 52
const RING_C = 2 * Math.PI * RING_R
const ringOffset = computed(() => RING_C - (overallScore.value / 100) * RING_C)

const balancedCount = computed(() => state.value.areas.length - alertedAreas.value.length)
const overallSub = computed(() => {
  const a = alertedAreas.value.length
  if (a === 0) return 'Todas as áreas em equilíbrio'
  const b = balancedCount.value
  return `${b} ${b === 1 ? 'área em equilíbrio' : 'áreas em equilíbrio'} · ${a} ${a === 1 ? 'precisa' : 'precisam'} de atenção`
})
</script>

<template>
  <div class="vida-page">
    <PageHero
      title="Vida"
      description="Seu check-in diário e o equilíbrio entre as áreas da vida — a média e o ponto mais frágil, lado a lado."
    />

    <VidaDailyCheckinCard />

    <!-- Hero: equilíbrio geral + ring -->
    <section class="hero">
      <div class="hero-text">
        <span class="hero-label">Equilíbrio geral</span>
        <div class="hero-score">
          {{ overallScore }}<sup>/100</sup>
        </div>
        <p class="hero-sub">{{ overallSub }}</p>
      </div>
      <div class="hero-ring">
        <svg viewBox="0 0 120 120">
          <circle class="ring-track" cx="60" cy="60" :r="RING_R" />
          <circle
            class="ring-progress"
            cx="60" cy="60" :r="RING_R"
            stroke="url(#vida-grad)"
            :stroke-dasharray="RING_C"
            :stroke-dashoffset="ringOffset"
          />
          <defs>
            <linearGradient id="vida-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0a84ff" />
              <stop offset="100%" stop-color="#5856d6" />
            </linearGradient>
          </defs>
        </svg>
        <span class="ring-center">{{ overallScore }}</span>
      </div>
    </section>

    <!-- Insight: ponto mais frágil -->
    <section v-if="weakestInsight" class="insight">
      <span class="insight-ico"><BaseIcon name="triangle-alert" :size="18" /></span>
      <div class="insight-text">
        <h4>{{ weakestInsight.title }}</h4>
        <p>{{ weakestInsight.text }}</p>
      </div>
    </section>

    <div class="section-label">Áreas da vida</div>
    <div class="areas">
      <VidaLifeAreaCard v-for="area in state.areas" :key="area.key" :area="area" />
    </div>

    <p class="foot-note">
      Vita mostra a média e o ponto mais frágil ao mesmo tempo — o que parece ok
      no agregado pode estar quebrado no detalhe.
    </p>
  </div>
</template>

<style scoped>
.vida-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px 26px 80px;
  max-width: 880px;
  margin: 0 auto;
}

/* ── Hero ── */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  padding: 26px 28px;
}
.hero-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
}
.hero-score {
  font-size: 64px;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  margin-top: 6px;
}
.hero-score sup {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-4);
  vertical-align: super;
  margin-left: 2px;
}
.hero-sub {
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
.hero-ring {
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}
.hero-ring svg {
  width: 120px;
  height: 120px;
  transform: rotate(-90deg);
}
.hero-ring circle {
  fill: none;
  stroke-width: 11;
  stroke-linecap: round;
}
.ring-track {
  stroke: color-mix(in srgb, var(--text) 7%, transparent);
}
.ring-progress {
  transition: stroke-dashoffset var(--dur-slow) var(--ease-spring);
}
.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* ── Insight ── */
.insight {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 16px 18px;
}
.insight-ico {
  color: var(--warning);
  flex-shrink: 0;
  margin-top: 1px;
}
.insight-text h4 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.insight-text p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

/* ── Areas ── */
.section-label {
  margin: 8px 4px 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
}
.areas {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.foot-note {
  text-align: center;
  margin: 18px auto 0;
  max-width: 46ch;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-4);
}

@media (max-width: 560px) {
  .vida-page {
    padding: 18px 16px 90px;
  }
  .hero-score {
    font-size: 48px;
  }
}
</style>

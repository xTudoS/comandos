<script setup lang="ts">
import { DOW, MESES } from '~/utils/dates'

const now = ref(new Date())
const dateLabel = computed(() => {
  const d = now.value
  return `${DOW[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} · ${d.getFullYear()}`
})

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 60_000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="auth-shell">
    <div class="mesh" aria-hidden="true">
      <div class="blob blob-1" />
      <div class="blob blob-2" />
      <div class="blob blob-3" />
    </div>
    <div class="noise" aria-hidden="true" />

    <main class="auth-stage">
      <div class="auth-card">
        <slot />
      </div>
      <footer class="auth-footer">
        <span class="footer-brand">Comando</span>
        <span class="footer-sep" aria-hidden="true">·</span>
        <time class="footer-date">{{ dateLabel }}</time>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  position: relative;
  min-height: 100dvh;
  background: #edf0f7;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
}

/* ── Gradient mesh ── */
.mesh {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.blob {
  position: absolute;
  border-radius: 50%;
}

.blob-1 {
  width: 780px;
  height: 780px;
  top: -260px;
  left: -220px;
  background: radial-gradient(circle at 40% 40%, #cdd8f0 0%, transparent 65%);
  opacity: 0.9;
  filter: blur(50px);
}

.blob-2 {
  width: 640px;
  height: 640px;
  bottom: -200px;
  right: -180px;
  background: radial-gradient(circle at 60% 60%, #beccec 0%, transparent 65%);
  opacity: 0.7;
  filter: blur(60px);
}

.blob-3 {
  width: 480px;
  height: 480px;
  top: 38%;
  left: 52%;
  background: radial-gradient(circle at 50% 50%, #d6e3f5 0%, transparent 65%);
  opacity: 0.55;
  filter: blur(55px);
}

/* ── Noise texture ── */
.noise {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.038;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 250px 250px;
}

/* ── Card ── */
.auth-stage {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.auth-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 22px;
  box-shadow:
    0 32px 64px rgba(0, 0, 0, 0.10),
    0 2px 4px rgba(0, 0, 0, 0.06);
  padding: 44px 40px;
  animation: card-spring 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes card-spring {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.975);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ── Footer ── */
.auth-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #aeaeb2;
  letter-spacing: -0.01em;
  animation: footer-in 600ms 120ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.footer-brand {
  font-weight: 500;
  color: #8e8e93;
}

.footer-sep {
  opacity: 0.55;
}

.footer-date {
  font-variant-numeric: tabular-nums;
}

@keyframes footer-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Responsive ── */
@media (min-width: 720px) {
  .auth-shell {
    padding: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-card,
  .auth-footer { animation: none; }
}
</style>

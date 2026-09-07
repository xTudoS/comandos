<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const route = useRoute()
const approvals = useDeviceApprovals()

const approvalId = computed(() => {
  const q = route.query.approval
  return typeof q === 'string' ? q : ''
})
const email = computed(() => {
  const q = route.query.email
  return typeof q === 'string' ? q : ''
})
const status = ref<'pending' | 'approved' | 'rejected' | 'expired' | 'error'>('pending')
const errMessage = ref('')
let timer: ReturnType<typeof setInterval> | undefined

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

async function tick() {
  if (!approvalId.value) {
    status.value = 'error'
    errMessage.value = 'Id de aprovação ausente.'
    stop()
    return
  }
  try {
    const res = await approvals.waitFor(approvalId.value)
    status.value = res.status
    if (res.status === 'approved' && email.value) {
      stop()
      const redirectParams = route.query.redirect ? `&redirect=${encodeURIComponent(route.query.redirect as string)}` : ''
      window.location.href = `/login?retry=${encodeURIComponent(email.value)}${redirectParams}`
      await new Promise(() => {})
    } else if (res.status !== 'pending') {
      stop()
    }
  } catch (e) {
    errMessage.value = (e as { message?: string })?.message ?? ''
  }
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 3000)
})

onUnmounted(stop)

const statusMeta = computed(() => {
  switch (status.value) {
    case 'pending':  return { tone: 'pending'  as const }
    case 'approved': return { tone: 'success'  as const }
    case 'rejected': return { tone: 'danger'   as const }
    case 'expired':  return { tone: 'warning'  as const }
    case 'error':    return { tone: 'danger'   as const }
  }
})
</script>

<template>
  <div class="waiting">

    <!-- ── Status icon ── -->
    <div class="icon-wrap" aria-hidden="true">
      <div class="status-icon" :class="`tone-${statusMeta.tone}`">
        <!-- Pending: animated shield -->
        <Transition name="icon-swap" mode="out-in">
          <svg v-if="status === 'pending'" key="pending" class="icon-svg" viewBox="0 0 28 28" fill="none">
            <path d="M14 3L5 7v7c0 5.25 3.85 10.15 9 11.33C19.15 24.15 23 19.25 23 14V7L14 3Z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
            <circle cx="14" cy="14" r="2.5" fill="white" opacity="0.9"/>
          </svg>
          <svg v-else-if="status === 'approved'" key="approved" class="icon-svg" viewBox="0 0 28 28" fill="none">
            <path d="M7 14.5L11.5 19L21 10" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else-if="status === 'rejected'" key="rejected" class="icon-svg" viewBox="0 0 28 28" fill="none">
            <path d="M14 3L5 7v7c0 5.25 3.85 10.15 9 11.33C19.15 24.15 23 19.25 23 14V7L14 3Z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M10.5 10.5L17.5 17.5M17.5 10.5L10.5 17.5" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <svg v-else-if="status === 'expired'" key="expired" class="icon-svg" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="9.5" stroke="white" stroke-width="1.8"/>
            <path d="M14 9.5V14.5L17 17" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else key="error" class="icon-svg" viewBox="0 0 28 28" fill="none">
            <path d="M14 10V15" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
            <circle cx="14" cy="19" r="1.2" fill="white"/>
            <path d="M12.13 4.77a2.13 2.13 0 0 1 3.74 0L24.8 21a2.13 2.13 0 0 1-1.87 3.17H5.07A2.13 2.13 0 0 1 3.2 21L12.13 4.77Z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </Transition>

        <!-- Pulse ring for pending -->
        <span v-if="status === 'pending'" class="pulse-ring" aria-hidden="true" />
      </div>
    </div>

    <!-- ── Text ── -->
    <header class="intro" aria-live="polite" aria-atomic="true">
      <Transition name="text-swap" mode="out-in">
        <div :key="status" class="text-block">
          <h1 class="title">
            {{ status === 'pending'  ? 'Aguardando aprovação'
             : status === 'approved' ? 'Aprovado'
             : status === 'rejected' ? 'Acesso negado'
             : status === 'expired'  ? 'Pedido expirou'
             : 'Erro' }}
          </h1>
          <p class="subtitle">
            <template v-if="status === 'pending'">
              Aprove este dispositivo no seu aparelho de confiança. Pode levar alguns instantes.
            </template>
            <template v-else-if="status === 'approved'">
              Continuando…
            </template>
            <template v-else-if="status === 'rejected'">
              O acesso foi negado pelo seu dispositivo de confiança.
            </template>
            <template v-else-if="status === 'expired'">
              Seu pedido expirou. Tente entrar novamente.
            </template>
            <template v-else>
              {{ errMessage || 'Não foi possível checar a aprovação.' }}
            </template>
          </p>
        </div>
      </Transition>
    </header>

    <!-- ── Approval ID chip ── -->
    <div v-if="status === 'pending' && approvalId" class="approval-chip">
      <span class="chip-label">Código de aprovação</span>
      <span class="chip-id">{{ approvalId }}</span>
    </div>

    <!-- ── Progress track (pending) ── -->
    <div v-if="status === 'pending'" class="progress-track" aria-hidden="true">
      <div class="progress-bar" />
    </div>

    <!-- ── Back button ── -->
    <button
      v-if="status === 'rejected' || status === 'expired' || status === 'error'"
      type="button"
      class="back-btn"
      @click="navigateTo('/login')"
    >
      <svg class="back-icon" viewBox="0 0 16 16" fill="none">
        <path d="M10 13L5 8l5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Voltar
    </button>

  </div>
</template>

<style scoped>
.waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}

/* ── Status icon ── */
.icon-wrap {
  padding-top: 4px;
}

.status-icon {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: icon-spring 560ms 60ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes icon-spring {
  from { opacity: 0; transform: scale(0.75) rotate(-8deg); }
  to   { opacity: 1; transform: scale(1) rotate(0deg); }
}

.status-icon.tone-pending {
  background: linear-gradient(160deg, #1a91ff 0%, #0066cc 100%);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.28) inset,
    0 14px 32px -6px rgba(0, 102, 204, 0.52),
    0 3px 6px rgba(0, 0, 0, 0.12);
}

.status-icon.tone-success {
  background: linear-gradient(160deg, #34c759 0%, #248a3d 100%);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.28) inset,
    0 14px 32px -6px rgba(48, 164, 108, 0.52),
    0 3px 6px rgba(0, 0, 0, 0.12);
}

.status-icon.tone-danger {
  background: linear-gradient(160deg, #ff453a 0%, #c0281e 100%);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.28) inset,
    0 14px 32px -6px rgba(217, 49, 65, 0.52),
    0 3px 6px rgba(0, 0, 0, 0.12);
}

.status-icon.tone-warning {
  background: linear-gradient(160deg, #ff9f0a 0%, #c47900 100%);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.28) inset,
    0 14px 32px -6px rgba(217, 119, 6, 0.52),
    0 3px 6px rgba(0, 0, 0, 0.12);
}

.icon-svg {
  width: 28px;
  height: 28px;
  position: relative;
  z-index: 1;
}

/* ── Pulse ring ── */
.pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(10, 132, 255, 0.45);
  animation: pulse 2s cubic-bezier(0.2, 0, 0.8, 1) infinite;
}

@keyframes pulse {
  0%   { opacity: 0.6; transform: scale(1); }
  75%  { opacity: 0;   transform: scale(1.65); }
  100% { opacity: 0;   transform: scale(1.65); }
}

/* ── Text ── */
.intro {
  width: 100%;
}

.text-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: #1d1d1f;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
}

.subtitle {
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  color: #6e6e73;
  margin: 0;
  max-width: 260px;
}

/* ── Icon swap transition ── */
.icon-swap-enter-active,
.icon-swap-leave-active {
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.icon-swap-enter-from { opacity: 0; transform: scale(0.7); }
.icon-swap-leave-to   { opacity: 0; transform: scale(0.7); }

/* ── Text swap transition ── */
.text-swap-enter-active,
.text-swap-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.text-swap-enter-from { opacity: 0; transform: translateY(4px); }
.text-swap-leave-to   { opacity: 0; transform: translateY(-4px); }

/* ── Approval ID chip ── */
.approval-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.10);
  border-radius: 999px;
  padding: 6px 14px 6px 12px;
}

.chip-label {
  font-size: 11px;
  color: #aeaeb2;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.chip-id {
  font-size: 12px;
  color: #3c3c43;
  font-family: "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
}

/* ── Progress track ── */
.progress-track {
  width: 100%;
  height: 2px;
  background: rgba(0, 0, 0, 0.07);
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  width: 30%;
  background: rgba(10, 132, 255, 0.65);
  border-radius: 999px;
  animation: progress-slide 2.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes progress-slide {
  0%   { transform: translateX(-100%); width: 30%; }
  50%  { width: 55%; }
  100% { transform: translateX(400%); width: 30%; }
}

/* ── Back button ── */
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 20px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.09);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  color: #1d1d1f;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: -0.1px;
  min-width: 140px;
  justify-content: center;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    transform 120ms var(--ease-spring);
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.14);
}

.back-btn:active {
  transform: scale(0.975);
}

.back-icon {
  width: 14px;
  height: 14px;
  margin-left: -2px;
  flex-shrink: 0;
}

/* ── Accessibility ── */
@media (prefers-reduced-motion: reduce) {
  .status-icon { animation: none; }
  .pulse-ring  { animation: none; }
  .progress-bar { animation: none; width: 60%; transform: none; }
  .icon-swap-enter-from,
  .icon-swap-leave-to,
  .text-swap-enter-from,
  .text-swap-leave-to { transform: none; }
}
</style>

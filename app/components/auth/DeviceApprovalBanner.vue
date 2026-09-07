<script setup lang="ts">
const approvals = useDeviceApprovals()
const busy = ref<string | null>(null)
const err = ref('')

// Shared state across layout mounts via useState; only hit the network
// if we haven't loaded yet. Subsequent client navs skip the refetch.
const lastFetchedAt = useState<number | null>('device-approvals:last-fetched', () => null)

onMounted(() => {
  const stale = !lastFetchedAt.value || Date.now() - lastFetchedAt.value > 60_000
  if (stale && !approvals.loading.value) {
    approvals.refresh().then(() => (lastFetchedAt.value = Date.now()))
  }
})

async function onDecide(id: string, decision: 'approve' | 'reject') {
  busy.value = id
  err.value = ''
  try {
    await approvals.decide(id, decision)
  } catch (e) {
    err.value = (e as { message?: string })?.message ?? 'Falha ao decidir.'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div v-if="approvals.pending.value.length" class="approval-banner" role="alert">
    <div v-for="a in approvals.pending.value" :key="a.id" class="approval-row">
      <span class="approval-ico"><BaseIcon name="shield-alert" :size="16" /></span>
      <span class="approval-text">
        <strong>Novo dispositivo pediu acesso</strong>
        <span class="approval-meta">
          {{ a.requestUserAgent || 'Dispositivo desconhecido' }}<span v-if="a.requestIp"> · {{ a.requestIp }}</span>
        </span>
      </span>
      <span class="approval-actions">
        <button
          class="ab-btn approve"
          type="button"
          :disabled="!!busy"
          @click="onDecide(a.id, 'approve')"
        >
          <BaseIcon name="check" :size="14" />{{ busy === a.id ? '…' : 'Aprovar' }}
        </button>
        <button
          class="ab-btn reject"
          type="button"
          :disabled="!!busy"
          @click="onDecide(a.id, 'reject')"
        >
          <BaseIcon name="x" :size="14" />{{ busy === a.id ? '…' : 'Rejeitar' }}
        </button>
      </span>
    </div>
    <p v-if="err" class="approval-err">
      <BaseIcon name="triangle-alert" :size="13" />{{ err }}
    </p>
  </div>
</template>

<style scoped>
.approval-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--amber) 12%, var(--panel));
  border-bottom: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
}
.approval-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.approval-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--amber) 18%, transparent);
  color: var(--amber);
  flex-shrink: 0;
}
.approval-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 180px;
  font-size: 13px;
}
.approval-text strong {
  font-weight: 650;
  color: var(--text);
}
.approval-meta {
  font-size: 12px;
  color: var(--text-3);
}
.approval-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.ab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: filter var(--dur-fast) var(--ease-spring), opacity var(--dur-fast) var(--ease-spring);
}
.ab-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.ab-btn.approve {
  background: var(--success);
  color: var(--accent-fg);
}
.ab-btn.approve:not(:disabled):hover {
  filter: brightness(1.06);
}
.ab-btn.reject {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--text-2);
}
.ab-btn.reject:not(:disabled):hover {
  border-color: var(--danger);
  color: var(--danger);
}
.approval-err {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--danger);
  margin: 0;
}
</style>

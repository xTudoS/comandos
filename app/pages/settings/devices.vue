<script setup lang="ts">
type PasskeyRow = {
  id: string
  deviceType: string | null
  backedUp: boolean
  transports: string | null
  createdAt: string
}

type HistoryRow = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  requestUserAgent: string | null
  requestIp: string | null
  requestedAt: string
  decidedAt: string | null
  expiresAt: string
}

// Lazy: não bloqueia a renderização da tela (preenche assim que chega).
const { data: passkeysData, pending: passkeysPending, refresh: refreshPasskeys } = useLazyFetch<{
  passkeys: PasskeyRow[]
}>('/api/auth/passkeys')
const { data: historyData, pending: historyPending } = useLazyFetch<{ history: HistoryRow[] }>(
  '/api/auth/device-approvals/history',
)

const passkeys = computed(() => passkeysData.value?.passkeys ?? [])
const history = computed(() => historyData.value?.history ?? [])

// ── Cadastrar nova passkey neste dispositivo ──
const auth = useAuth()
const adding = ref(false)
const addErr = ref('')

async function onAddPasskey() {
  addErr.value = ''
  adding.value = true
  try {
    await auth.registerPasskey()
    await refreshPasskeys()
  } catch (e: unknown) {
    addErr.value = (e as { message?: string })?.message ?? 'Não foi possível cadastrar a passkey.'
  } finally {
    adding.value = false
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

const statusMeta: Record<HistoryRow['status'], { label: string; tone: string; icon: string }> = {
  pending: { label: 'Pendente', tone: 'amber', icon: 'clock' },
  approved: { label: 'Aprovado', tone: 'success', icon: 'circle-check' },
  rejected: { label: 'Rejeitado', tone: 'danger', icon: 'circle-x' },
  expired: { label: 'Expirado', tone: 'muted', icon: 'circle-slash' },
}
</script>

<template>
  <div class="devices-page">
    <PageHero
      title="Dispositivos e passkeys"
      description="Gerencie os dispositivos autorizados e o histórico de aprovações desta conta."
    />

    <!-- ── Passkeys ── -->
    <section class="block">
      <header class="block-head">
        <span class="block-ico"><BaseIcon name="key-round" :size="16" /></span>
        <h2 class="block-title">Passkeys</h2>
        <span v-if="passkeys.length" class="block-count">{{ passkeys.length }}</span>
        <button type="button" class="add-btn" :disabled="adding" @click="onAddPasskey">
          <BaseIcon name="plus" :size="15" />
          {{ adding ? 'Cadastrando…' : 'Adicionar passkey' }}
        </button>
      </header>

      <p v-if="addErr" class="err-line">
        <BaseIcon name="triangle-alert" :size="14" />{{ addErr }}
      </p>

      <ul v-if="passkeys.length" class="list">
        <li v-for="p in passkeys" :key="p.id" class="row">
          <span class="row-ico graphite"><BaseIcon name="fingerprint" :size="18" /></span>
          <div class="row-info">
            <span class="row-name">{{ p.deviceType || 'Dispositivo' }}</span>
            <span class="row-meta">
              <span>Criada em {{ formatDate(p.createdAt) }}</span>
              <span v-if="p.transports" class="dot">· {{ p.transports }}</span>
            </span>
          </div>
          <span v-if="p.backedUp" class="tag success">
            <BaseIcon name="cloud" :size="11" />Sincronizada
          </span>
        </li>
      </ul>

      <p v-else-if="passkeysPending" class="muted-line">Carregando…</p>
      <p v-else class="muted-line">Nenhuma passkey registrada ainda.</p>
    </section>

    <!-- ── Histórico de aprovações ── -->
    <section class="block">
      <header class="block-head">
        <span class="block-ico"><BaseIcon name="history" :size="16" /></span>
        <h2 class="block-title">Histórico de aprovações</h2>
        <span v-if="history.length" class="block-count">{{ history.length }}</span>
      </header>

      <ul v-if="history.length" class="list">
        <li v-for="h in history" :key="h.id" class="row">
          <span class="tag" :class="statusMeta[h.status].tone">
            <BaseIcon :name="statusMeta[h.status].icon" :size="11" />{{ statusMeta[h.status].label }}
          </span>
          <div class="row-info">
            <span class="row-name device">
              <BaseIcon name="monitor" :size="13" class="device-ico" />
              {{ h.requestUserAgent || 'Dispositivo desconhecido' }}
            </span>
            <span class="row-meta">
              <span>Solicitado {{ formatDate(h.requestedAt) }}</span>
              <span v-if="h.decidedAt" class="dot">· decidido {{ formatDate(h.decidedAt) }}</span>
              <span v-if="h.requestIp" class="dot">· {{ h.requestIp }}</span>
            </span>
          </div>
        </li>
      </ul>

      <p v-else-if="historyPending" class="muted-line">Carregando…</p>
      <p v-else class="muted-line">Nenhuma solicitação registrada.</p>
    </section>
  </div>
</template>

<style scoped>
.devices-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 24px 26px 60px;
  max-width: 820px;
  margin: 0 auto;
}

/* ── Block / section ── */
.block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px;
}
.block-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text-2);
  flex-shrink: 0;
}
.block-title {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
  margin: 0;
}
.block-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-hover);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}
.add-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-spring), background var(--dur-fast) var(--ease-spring);
}
.add-btn:not(:disabled):hover {
  border-color: var(--accent);
  color: var(--accent);
}
.add-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.err-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--danger);
  margin: 0 2px;
}

/* ── List ── */
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: border-color var(--dur-fast) var(--ease-spring);
}
.row:hover {
  border-color: var(--border-strong);
}
.row-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}
.row-ico.graphite {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-name.device {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 550;
}
.device-ico {
  color: var(--text-3);
  flex-shrink: 0;
}
.row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-4);
}
.row-meta .dot {
  color: var(--text-4);
}

/* ── Tags / status ── */
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}
.tag.success {
  background: var(--success-bg);
  color: var(--success);
}
.tag.danger {
  background: var(--danger-bg);
  color: var(--danger);
}
.tag.amber {
  background: color-mix(in srgb, var(--amber) 16%, transparent);
  color: var(--amber);
}
.tag.muted {
  background: var(--surface-hover);
  color: var(--text-3);
}

/* ── Empty / loading ── */
.muted-line {
  font-size: 13px;
  color: var(--text-3);
  padding: 4px 2px;
  margin: 0;
}

@media (max-width: 680px) {
  .devices-page {
    padding: 18px 16px 80px;
  }
  .row {
    flex-wrap: wrap;
  }
}
</style>

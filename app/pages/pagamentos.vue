<script setup lang="ts">
import type { ActionItem as MenuItem } from '#ui/types'
import type {
  Payment,
  PaymentStatus,
  PaymentKind,
  PaymentRecurrence,
  CreatePaymentInput,
  UpdatePaymentPatch,
} from '~/composables/usePayments'
import type { SavePayload as PagamentoSavePayload } from '~/components/modals/ModalPagamento.vue'
import { formatBRL } from '~/utils/money'
const { list, summary, loading, refresh, create, update, setPaid, archive, remove } = usePayments()
const { show: toast } = useToast()

// Não bloqueia a renderização: pinta a página com "Carregando…" e busca os
// dados no mount. Antes, o await de topo suspendia o render via Suspense.
loading.value = true
onMounted(() => {
  refresh().catch(() => {})
})

type ViewMode = 'lista' | 'extrato'
const viewMode = ref<ViewMode>('lista')

type Filter = 'all' | 'overdue' | PaymentStatus
const filter = ref<Filter>('all')
const kindFilter = ref<'all' | PaymentKind>('all')

const today = new Date().toISOString().slice(0, 10)

function isOverdue(p: Payment): boolean {
  return p.status === 'pending' && p.dueDate < today
}

const visible = computed(() => {
  let rows = list.value.filter((p) => !p.archived)
  if (kindFilter.value !== 'all') rows = rows.filter((p) => p.kind === kindFilter.value)
  if (filter.value === 'all') return rows
  if (filter.value === 'overdue') return rows.filter(isOverdue)
  return rows.filter((p) => p.status === filter.value)
})

const overdueCount = computed(
  () => list.value.filter((p) => !p.archived && isOverdue(p)).length,
)

function formatDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function paymentBoxStatus(p: Payment): 'paid' | 'overdue' | 'pending' {
  if (p.status === 'paid') return 'paid'
  if (isOverdue(p)) return 'overdue'
  return 'pending'
}

function statusLabel(p: Payment): string {
  const s = paymentBoxStatus(p)
  if (s === 'paid') return p.kind === 'income' ? 'Recebido' : 'Pago'
  if (s === 'overdue') return 'Atrasado'
  return 'A vencer'
}

const RECURRENCE_LABEL: Record<PaymentRecurrence, string> = {
  none: '',
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

const editing = ref<Payment | null>(null)
const modalOpen = ref(false)
const modalRef = ref<{ setSaving: (v: boolean) => void; setError: (msg: string | null) => void } | null>(null)

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(p: Payment) {
  editing.value = p
  modalOpen.value = true
}

/**
 * `/pagamentos?abrir=<id>` abre o pagamento direto — é como a agenda entrega o
 * clique num vencimento. A query é consumida (`replace`) para o F5 não reabrir.
 */
const route = useRoute()
const router = useRouter()
watch(
  [() => route.query.abrir, () => list.value.length],
  ([abrir]) => {
    if (typeof abrir !== 'string' || !abrir) return
    const alvo = list.value.find((p) => p.id === abrir)
    if (!alvo) return
    openEdit(alvo)
    void router.replace({ path: '/pagamentos' })
  },
  { immediate: true },
)

async function onPagamentoSave(payload: PagamentoSavePayload, isEdit: boolean) {
  modalRef.value?.setSaving(true)
  try {
    if (isEdit && editing.value) {
      const patch: UpdatePaymentPatch = {
        description: payload.description,
        amountCents: payload.amountCents,
        dueDate: payload.dueDate,
        notes: payload.notes,
        kind: payload.kind,
        recurrence: payload.recurrence,
        companyId: payload.companyId,
      }
      await update(editing.value.id, patch)
    } else {
      const body: CreatePaymentInput = {
        description: payload.description,
        amountCents: payload.amountCents,
        dueDate: payload.dueDate,
        notes: payload.notes || undefined,
        kind: payload.kind,
        recurrence: payload.recurrence,
        companyId: payload.companyId,
      }
      await create(body)
    }
    modalOpen.value = false
  } catch (e) {
    modalRef.value?.setError((e as { message?: string })?.message ?? 'Falha ao salvar.')
  } finally {
    modalRef.value?.setSaving(false)
  }
}

async function onTogglePaid(p: Payment) {
  const becomingPaid = p.status !== 'paid'
  await setPaid(p.id, becomingPaid)
  // summary já refrescou; mostra toast com novo saldo após operação.
  if (becomingPaid) {
    const sign = p.kind === 'income' ? '+' : '−'
    const verb = p.kind === 'income' ? 'Entrada' : 'Saída'
    toast(
      `${verb} confirmada: ${sign}${formatBRL(p.amountCents)} · Saldo: ${formatBRL(summary.value.balanceCents)}`,
    )
  } else {
    toast(`Confirmação revertida · Saldo: ${formatBRL(summary.value.balanceCents)}`)
  }
}

// === Extrato (cronológico de operações confirmadas com saldo após) ===

type ExtratoRow = {
  payment: Payment
  delta: number
  runningBalance: number
}

const extrato = computed<ExtratoRow[]>(() => {
  const paid = list.value
    .filter((p) => !p.archived && p.status === 'paid' && p.paidAt)
    .slice()
    .sort((a, b) => (a.paidAt ?? '').localeCompare(b.paidAt ?? ''))
  let running = 0
  const out: ExtratoRow[] = []
  for (const p of paid) {
    const delta = p.kind === 'income' ? p.amountCents : -p.amountCents
    running += delta
    out.push({ payment: p, delta, runningBalance: running })
  }
  // Mais recentes primeiro na exibição.
  return out.reverse()
})

function fmtPaidAt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

type ConfirmKind = 'archive' | 'delete'
const confirmKind = ref<ConfirmKind | null>(null)
const confirmTarget = ref<Payment | null>(null)
const confirming = ref(false)
const confirmOpen = computed({
  get: () => confirmKind.value !== null,
  set: (v: boolean) => {
    if (!v && !confirming.value) {
      confirmKind.value = null
      confirmTarget.value = null
    }
  },
})
const confirmTitle = computed(() =>
  confirmKind.value === 'delete' ? 'Apagar pagamento' : 'Arquivar pagamento',
)
const confirmMessage = computed(() => {
  if (!confirmTarget.value) return ''
  if (confirmKind.value === 'delete') {
    return `Apagar "${confirmTarget.value.description}" permanentemente? Essa ação não pode ser desfeita.`
  }
  return `Arquivar "${confirmTarget.value.description}"?`
})
const confirmCta = computed(() => (confirmKind.value === 'delete' ? 'Apagar' : 'Arquivar'))

function onArchive(p: Payment) {
  confirmKind.value = 'archive'
  confirmTarget.value = p
}
function onDelete(p: Payment) {
  confirmKind.value = 'delete'
  confirmTarget.value = p
}

const rowActions: MenuItem[] = [
  { key: 'edit', label: 'Editar', icon: 'pencil' },
  { key: 'archive', label: 'Arquivar', icon: 'archive', tone: 'warning' },
  { key: 'delete', label: 'Apagar', icon: 'trash-2', tone: 'danger' },
]

function onRowAction(key: string, p: Payment) {
  if (key === 'edit') openEdit(p)
  else if (key === 'archive') onArchive(p)
  else if (key === 'delete') onDelete(p)
}
async function onConfirm() {
  const kind = confirmKind.value
  const target = confirmTarget.value
  if (!kind || !target) return
  confirming.value = true
  try {
    if (kind === 'archive') await archive(target.id, true)
    else await remove(target.id)
    confirmKind.value = null
    confirmTarget.value = null
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="clean-wrap">
    <PageHeader title="Pagamentos" desc="Entradas, saídas e provisionamento.">
      <template #actions>
        <button class="btn primary" @click="openNew">+ Novo</button>
      </template>
    </PageHeader>

    <!-- Wallet: saldo realizado lifetime + previsto + entradas/saídas pendentes -->
    <div class="wallet">
      <div class="wallet-card balance" :class="{ neg: summary.balanceCents < 0 }">
        <div class="wallet-label">Saldo atual (confirmado)</div>
        <div class="wallet-value">
          {{ summary.balanceCents >= 0 ? '' : '−' }}{{ formatBRL(Math.abs(summary.balanceCents)) }}
        </div>
        <div class="wallet-meta">
          Mês: {{ summary.balanceMonthCents >= 0 ? '+' : '−' }}{{ formatBRL(Math.abs(summary.balanceMonthCents)) }}
          · Previsto:
          <strong :class="{ pos: summary.forecastBalanceCents >= 0, neg: summary.forecastBalanceCents < 0 }">
            {{ summary.forecastBalanceCents >= 0 ? '' : '−' }}{{ formatBRL(Math.abs(summary.forecastBalanceCents)) }}
          </strong>
        </div>
      </div>
      <div class="wallet-card income">
        <div class="wallet-label">
          <BaseIcon name="arrow-down-left" :size="14" class="wl-ico" />
          Entradas a receber
        </div>
        <div class="wallet-value">{{ formatBRL(summary.incomePendingTotalCents) }}</div>
        <div class="wallet-meta">
          Recebido no mês: {{ formatBRL(summary.incomePaidMonthTotalCents) }}
        </div>
      </div>
      <div class="wallet-card expense">
        <div class="wallet-label">
          <BaseIcon name="arrow-up-right" :size="14" class="wl-ico" />
          Saídas a pagar
        </div>
        <div class="wallet-value">{{ formatBRL(summary.pendingTotalCents) }}</div>
        <div class="wallet-meta">
          Pago no mês: {{ formatBRL(summary.expensePaidMonthTotalCents) }}
        </div>
      </div>
    </div>

    <!-- Toggle Lista / Extrato -->
    <div class="view-toggle">
      <AppSegmented
        v-model="viewMode"
        aria-label="Modo de exibição"
        :items="[
          { value: 'lista', label: 'Lista' },
          { value: 'extrato', label: 'Extrato' },
        ]"
      />
    </div>

    <!-- Banner de alerta de atrasados -->
    <div
      v-if="overdueCount > 0"
      class="overdue-banner"
      role="alert"
      @click="filter = 'overdue'"
    >
      <BaseIcon name="alert-triangle" :size="16" class="ob-ico" />
      <div class="ob-text">
        <strong>{{ overdueCount }} pagamento{{ overdueCount === 1 ? ' atrasado' : 's atrasados' }}</strong>
        — {{ formatBRL(summary.overdueTotalCents) }} no total. Marque como pagos ou ajuste a data.
      </div>
      <button type="button" class="ob-cta">
        Ver atrasados
        <BaseIcon name="arrow-right" :size="13" aria-hidden="true" />
      </button>
    </div>

    <!-- 3 caixinhas: a vencer / atrasado / pago -->
    <div class="boxes">
      <button
        type="button"
        class="box pending"
        :class="{ active: filter === 'pending' }"
        @click="filter = filter === 'pending' ? 'all' : 'pending'"
      >
        <div class="box-label">A vencer</div>
        <div class="box-value">{{ formatBRL(summary.pendingTotalCents - summary.overdueTotalCents) }}</div>
        <div class="box-meta">{{ summary.pendingCount - summary.overdueCount }} item{{ summary.pendingCount - summary.overdueCount === 1 ? '' : 's' }}</div>
      </button>
      <button
        type="button"
        class="box overdue"
        :class="{ active: filter === 'overdue', zero: summary.overdueCount === 0 }"
        @click="filter = filter === 'overdue' ? 'all' : 'overdue'"
      >
        <div class="box-label">Atrasado</div>
        <div class="box-value">{{ formatBRL(summary.overdueTotalCents) }}</div>
        <div class="box-meta">{{ summary.overdueCount }} item{{ summary.overdueCount === 1 ? '' : 's' }}</div>
      </button>
      <button
        type="button"
        class="box paid"
        :class="{ active: filter === 'paid' }"
        @click="filter = filter === 'paid' ? 'all' : 'paid'"
      >
        <div class="box-label">Pago no mês</div>
        <div class="box-value">{{ formatBRL(summary.paidMonthTotalCents) }}</div>
        <div class="box-meta">{{ summary.paidMonthCount }} item{{ summary.paidMonthCount === 1 ? '' : 's' }}</div>
      </button>
    </div>

    <template v-if="viewMode === 'lista'">
      <!-- Filtros: tipo (entrada/saída) -->
      <div class="filters">
        <AppSegmented
          v-model="kindFilter"
          aria-label="Tipo"
          :items="[
            { value: 'all', label: 'Todos' },
            { value: 'expense', label: 'Saídas' },
            { value: 'income', label: 'Entradas' },
          ]"
        />
      </div>

      <div v-if="loading && visible.length === 0" class="empty-state">Carregando…</div>
      <div v-else-if="visible.length === 0" class="empty-state">
        <BaseIcon name="wallet" :size="40" class="big" />
        <div v-if="list.length === 0">Nenhum lançamento. Clique em "+ Novo" para começar.</div>
        <div v-else>Nenhum lançamento bate com o filtro.</div>
      </div>

      <div v-else class="inv-card">
        <table class="inv-table">
          <thead>
            <tr>
              <th class="c-check" aria-label="Confirmado" />
              <th class="c-desc">Descrição</th>
              <th class="c-kind">Tipo</th>
              <th class="c-date">Vencimento</th>
              <th class="c-amount">Valor</th>
              <th class="c-status">Status</th>
              <th class="c-act" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in visible"
              :key="p.id"
              class="inv-row"
              :class="[paymentBoxStatus(p), `kind-${p.kind}`]"
              @click="openEdit(p)"
            >
              <td class="c-check" @click.stop>
                <AppCircleCheck
                  :model-value="p.status === 'paid'"
                  variant="success"
                  :aria-label="`Marcar ${p.description} como ${p.status === 'paid' ? (p.kind === 'income' ? 'a receber' : 'pendente') : (p.kind === 'income' ? 'recebido' : 'pago')}`"
                  @update:model-value="onTogglePaid(p)"
                />
              </td>
              <td class="c-desc">
                <div class="td-title-row">
                  <span class="td-title" :class="{ 'line-through': p.status === 'paid' }">{{ p.description }}</span>
                  <span
                    v-if="p.recurrence !== 'none'"
                    class="td-recurr"
                    :title="`Recorrência ${RECURRENCE_LABEL[p.recurrence].toLowerCase()}`"
                  >
                    <BaseIcon name="repeat" :size="11" />
                    {{ RECURRENCE_LABEL[p.recurrence] }}
                  </span>
                </div>
                <div v-if="p.notes" class="td-notes">
                  {{ p.notes.length > 80 ? p.notes.slice(0, 80) + '…' : p.notes }}
                </div>
              </td>
              <td class="c-kind">
                <span class="kind-tag" :class="p.kind">
                  {{ p.kind === 'income' ? 'Entrada' : 'Saída' }}
                </span>
              </td>
              <td class="c-date">{{ formatDate(p.dueDate) }}</td>
              <td class="c-amount" :class="`v-${p.kind}`">
                {{ p.kind === 'income' ? '+' : '' }}{{ formatBRL(p.amountCents) }}
              </td>
              <td class="c-status">
                <span class="status-pill" :class="paymentBoxStatus(p)">{{ statusLabel(p) }}</span>
              </td>
              <td class="c-act" @click.stop>
                <BaseActionMenu
                  :items="rowActions"
                  aria-label="Ações do lançamento"
                  @select="(k) => onRowAction(k, p)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <!-- Extrato: cronológico de operações confirmadas com saldo após -->
      <div v-if="extrato.length === 0" class="empty-state">
        <BaseIcon name="receipt" :size="40" class="big" />
        <div>Nenhuma operação confirmada ainda.</div>
        <div class="empty-hint">Marque entradas e saídas como recebidas/pagas para construir o extrato.</div>
      </div>
      <ul v-else class="extrato-list">
        <li class="extrato-head">
          <div class="ex-when">Quando</div>
          <div class="ex-desc">Descrição</div>
          <div class="ex-valor">Valor</div>
          <div class="ex-saldo">Saldo após</div>
        </li>
        <li
          v-for="row in extrato"
          :key="row.payment.id"
          class="extrato-row"
          :class="`kind-${row.payment.kind}`"
          @click="openEdit(row.payment)"
        >
          <div class="ex-when">{{ fmtPaidAt(row.payment.paidAt) }}</div>
          <div class="ex-desc">
            <span class="ex-titulo">{{ row.payment.description }}</span>
            <span class="ex-kind-tag" :class="row.payment.kind">
              {{ row.payment.kind === 'income' ? 'Entrada' : 'Saída' }}
            </span>
          </div>
          <div class="ex-valor" :class="`v-${row.payment.kind}`">
            {{ row.delta >= 0 ? '+' : '−' }}{{ formatBRL(Math.abs(row.delta)) }}
          </div>
          <div
            class="ex-saldo"
            :class="{ neg: row.runningBalance < 0 }"
          >
            {{ row.runningBalance >= 0 ? '' : '−' }}{{ formatBRL(Math.abs(row.runningBalance)) }}
          </div>
        </li>
      </ul>
    </template>

    <AppSheet v-model:open="confirmOpen" :dismissible="!confirming">
      <div class="modal confirm-modal">
        <header class="modal-head">
          <h3>{{ confirmTitle }}</h3>
        </header>
        <div class="modal-body">
          <p class="confirm-msg">{{ confirmMessage }}</p>
        </div>
        <footer class="modal-foot">
          <div class="actions">
            <button class="btn ghost" :disabled="confirming" @click="confirmOpen = false">
              Cancelar
            </button>
            <button
              class="btn"
              :class="confirmKind === 'delete' ? 'danger' : 'primary'"
              :disabled="confirming"
              @click="onConfirm"
            >
              {{ confirming ? '…' : confirmCta }}
            </button>
          </div>
        </footer>
      </div>
    </AppSheet>

    <ModalPagamento
      ref="modalRef"
      v-model:open="modalOpen"
      :pagamento="editing"
      @save="onPagamentoSave"
    />
  </div>
</template>

<style scoped>
.clean-wrap {
  padding: 24px 26px 60px;
  max-width: 1480px;
  margin: 0 auto;
}

/* === Invoice-style table === */
.inv-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.inv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.inv-table thead th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-3);
  padding: 12px 14px;
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.inv-table tbody td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-faint);
  vertical-align: middle;
}
.inv-table tbody tr:last-child td {
  border-bottom: none;
}
.inv-row {
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
}
.inv-row:hover {
  background: var(--surface-hover);
}
.c-check { width: 40px; }
.c-check :deep(*) { cursor: pointer; }
.c-kind { width: 88px; }
.c-date { width: 110px; color: var(--text-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.c-amount {
  width: 130px;
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.c-amount.v-income { color: var(--success); }
.c-status { width: 110px; }
.c-act { width: 44px; text-align: right; }

.td-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.td-title {
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
}
.td-title.line-through { text-decoration: line-through; color: var(--text-3); }
.td-recurr {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-3);
  background: var(--surface-hover);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}
.td-notes {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 340px;
}

.kind-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.kind-tag.income { background: var(--success-bg); color: var(--success); }
.kind-tag.expense { background: var(--surface-hover); color: var(--text-2); }

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.status-pill::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill.pending { background: var(--warning-bg); color: var(--warning); }
.status-pill.overdue { background: var(--danger-bg); color: var(--danger); }
.status-pill.paid { background: var(--success-bg); color: var(--success); }

@media (max-width: 720px) {
  .c-kind, .c-date { display: none; }
  .td-notes { max-width: 160px; }
}

/* === Wallet === */
.wallet {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}
@media (max-width: 720px) {
  .wallet { grid-template-columns: 1fr; }
}
.wallet-card {
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
.wallet-card.balance {
  background: linear-gradient(135deg, rgba(0, 113, 227, 0.05), rgba(0, 113, 227, 0));
  border-color: rgba(0, 113, 227, 0.25);
}
.wallet-card.balance.neg {
  background: linear-gradient(135deg, rgba(201, 52, 42, 0.05), rgba(201, 52, 42, 0));
  border-color: rgba(201, 52, 42, 0.25);
}
.wallet-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.wallet-value {
  margin-top: 6px;
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.wallet-card.income .wallet-value,
.wallet-card.expense .wallet-value { font-size: 22px; font-weight: 600; }
/* Income/expense distinction lives in the label + directional icon, not a loud
   colored number — keeps the hero figures calm and on-brand (cf. .ds-value). */
.wallet-card.income .wallet-label .wl-ico { color: var(--success); }
.wallet-card.expense .wallet-label .wl-ico { color: var(--danger); }
.wallet-card.balance.neg .wallet-value { color: var(--danger); }
.wallet-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-3);
}
.wallet-meta .pos {
  color: var(--success);
  font-weight: 600;
}
.wallet-meta .neg {
  color: var(--danger);
  font-weight: 600;
}

/* === View toggle (Lista / Extrato) === */
.view-toggle {
  margin-bottom: 14px;
}

/* === Extrato === */
.empty-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-4);
}
.extrato-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.extrato-head {
  display: grid;
  grid-template-columns: 160px 1fr auto 140px;
  gap: 14px;
  padding: 10px 14px;
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-3);
}
.extrato-row {
  display: grid;
  grid-template-columns: 160px 1fr auto 140px;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
  align-items: center;
  position: relative;
}
.extrato-row:last-child {
  border-bottom: 0;
}
.extrato-row:hover {
  background: var(--surface-hover);
}
.extrato-row.kind-income::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--success);
}
.extrato-row.kind-expense::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--danger);
}
.ex-when {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ex-desc {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ex-titulo {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ex-kind-tag {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 999px;
  white-space: nowrap;
}
.ex-kind-tag.income {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success);
}
.ex-kind-tag.expense {
  background: rgba(201, 52, 42, 0.1);
  color: var(--danger);
}
.ex-valor {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.ex-valor.v-income {
  color: var(--success);
}
.ex-valor.v-expense {
  color: var(--danger);
}
.ex-saldo {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--text);
  white-space: nowrap;
}
.ex-saldo.neg {
  color: var(--danger);
}

@media (max-width: 720px) {
  .extrato-head {
    display: none;
  }
  .extrato-row {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 4px 10px;
    padding: 12px 14px;
  }
  .ex-when {
    grid-column: 1;
    grid-row: 1;
    font-size: 10px;
  }
  .ex-desc {
    grid-column: 1;
    grid-row: 2;
  }
  .ex-valor {
    grid-column: 2;
    grid-row: 1;
  }
  .ex-saldo {
    grid-column: 2;
    grid-row: 2;
    font-size: 12px;
  }
  .ex-saldo::before {
    content: 'Saldo: ';
    color: var(--text-3);
    font-weight: 400;
  }
}

/* === Overdue banner === */
.overdue-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: var(--ceo-soft);
  border: 1px solid rgba(201, 52, 42, 0.4);
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text);
  transition: background 0.15s;
}
.overdue-banner:hover {
  background: rgba(201, 52, 42, 0.12);
}
.ob-ico {
  flex-shrink: 0;
  color: var(--danger);
}
.ob-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.4;
}
.ob-text strong { color: var(--danger); }
.ob-cta {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--danger);
  color: var(--danger);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s;
}
.ob-cta:hover {
  background: var(--danger);
  color: var(--accent-fg);
}

/* === 3 boxes === */
.boxes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
@media (max-width: 720px) {
  .boxes { grid-template-columns: 1fr; }
}
.box {
  text-align: left;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.box:hover { background: var(--surface-hover); }
.box.active {
  border-color: var(--text);
  background: var(--surface-hover);
}
.box.overdue:not(.zero) {
  background: rgba(201, 52, 42, 0.06);
  border-color: rgba(201, 52, 42, 0.35);
}
.box-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.box.overdue:not(.zero) .box-label { color: var(--danger); }
.box.paid .box-label { color: var(--success); }
.box-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.box-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
}

.filters {
  margin-bottom: 14px;
}

/* === List === */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-3);
  font-size: 13px;
}
.empty-state .big {
  width: 40px;
  height: 40px;
  margin: 0 auto 10px;
  opacity: 0.5;
  color: var(--text-3);
}
.confirm-modal { width: min(420px, 96vw); }
.confirm-msg {
  font-size: 14px;
  color: var(--text);
  line-height: 1.5;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pagamento-card {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
  position: relative;
}
.pagamento-card:hover { background: var(--surface-hover); }
.pagamento-card.paid { opacity: 0.6; }
.pagamento-card.overdue { border-color: rgba(201, 52, 42, 0.35); }
.pagamento-card.kind-income::before {
  content: '';
  position: absolute;
  left: -1px;
  top: -1px;
  bottom: -1px;
  width: 3px;
  background: var(--success);
  border-radius: var(--radius) 0 0 var(--radius);
}
.pagamento-card.kind-expense::before {
  content: '';
  position: absolute;
  left: -1px;
  top: -1px;
  bottom: -1px;
  width: 3px;
  background: var(--danger);
  border-radius: var(--radius) 0 0 var(--radius);
}
.p-desc {
  font-weight: 500;
  font-size: 14px;
  color: var(--text);
  min-width: 0;
}
.p-titulo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.p-titulo {
  overflow: hidden;
  text-overflow: ellipsis;
}
.p-recurr {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-alt);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.p-desc.line-through .p-titulo {
  text-decoration: line-through;
  color: var(--text-3);
}
.p-notas {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 400;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.p-valor {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.p-valor.v-income { color: var(--success); }
.p-valor.v-expense { color: var(--text); }
.p-data {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pagamento-card.overdue .p-data {
  color: var(--pag-atrasado);
  font-weight: 600;
}
.p-status-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.pagamento-card.pending .p-status-label {
  background: var(--amber-bg);
  color: var(--amber);
}
.pagamento-card.paid .p-status-label {
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.pagamento-card.overdue .p-status-label {
  background: #fdebec;
  color: var(--pag-atrasado);
}
.p-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

@media (max-width: 700px) {
  .pagamento-card {
    grid-template-columns: auto 1fr auto;
    row-gap: 4px;
  }
  .p-data,
  .p-status-label,
  .p-actions {
    grid-column: span 1;
  }
}
.modal {
  display: flex;
  flex-direction: column;
  width: min(560px, 96vw);
  background: var(--bg);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.modal-head h3 {
  font-size: 14px;
  font-weight: 600;
}
.modal-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-foot {
  border-top: 1px solid var(--border);
  padding: 12px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
</style>

import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

export type PaymentStatus = 'pending' | 'paid'
export type PaymentKind = 'expense' | 'income'
export type PaymentRecurrence = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export type Payment = {
  id: string
  ownerUserId: string
  description: string
  amountCents: number
  dueDate: string
  kind: PaymentKind
  recurrence: PaymentRecurrence
  recurrenceParentId: string | null
  companyId: string | null
  status: PaymentStatus
  paidAt: string | null
  notes: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type PaymentsSummary = {
  pendingCount: number
  pendingTotalCents: number
  overdueCount: number
  overdueTotalCents: number
  paidMonthCount: number
  paidMonthTotalCents: number
  incomePendingTotalCents: number
  incomePaidMonthTotalCents: number
  expensePaidMonthTotalCents: number
  /** Saldo realizado lifetime. */
  balanceCents: number
  /** Variação realizada apenas no mês corrente. */
  balanceMonthCents: number
  /** Saldo previsto se todas as pendências forem confirmadas. */
  forecastBalanceCents: number
}

export type CreatePaymentInput = {
  description: string
  amountCents: number
  dueDate: string
  notes?: string
  kind?: PaymentKind
  recurrence?: PaymentRecurrence
  companyId?: string | null
}

export type UpdatePaymentPatch = Partial<
  Pick<Payment, 'description' | 'amountCents' | 'dueDate' | 'notes' | 'kind' | 'recurrence' | 'companyId'>
>

export function usePayments() {
  const list = useState<Payment[]>('payments:list', () => [])
  const summary = useState<PaymentsSummary>('payments:summary', () => ({
    pendingCount: 0,
    pendingTotalCents: 0,
    overdueCount: 0,
    overdueTotalCents: 0,
    paidMonthCount: 0,
    paidMonthTotalCents: 0,
    incomePendingTotalCents: 0,
    incomePaidMonthTotalCents: 0,
    expensePaidMonthTotalCents: 0,
    balanceCents: 0,
    balanceMonthCents: 0,
    forecastBalanceCents: 0,
  }))
  const loading = useState('payments:loading', () => false)
  const error = useState<string | null>('payments:error', () => null)

  async function refresh(opts: {
    includeArchived?: boolean
    status?: PaymentStatus
    kind?: PaymentKind
  } = {}) {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived) query.includeArchived = '1'
      if (opts.status) query.status = opts.status
      if (opts.kind) query.kind = opts.kind
      const res = await $fetch<{ payments: Payment[]; summary: PaymentsSummary }>(
        '/api/payments',
        { query },
      )
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('payments'))) {
        list.value = res.payments
        summary.value = res.summary
      }
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar pagamentos.'
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreatePaymentInput) {
    // Id gerado no cliente: o servidor o honra, então o reenvio da fila offline
    // não cria um id novo (evita id "stale" → 404 em PATCH posterior).
    const id = import.meta.client ? crypto.randomUUID() : undefined
    const body = id ? { ...input, id } : input
    try {
      await $fetch('/api/payments', { method: 'POST', body })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const now = new Date().toISOString()
      const optimistic: Payment = {
        id: id ?? `tmp-${now}`,
        ownerUserId: '',
        description: input.description,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        kind: input.kind ?? 'expense',
        recurrence: input.recurrence ?? 'none',
        recurrenceParentId: null,
        companyId: input.companyId ?? null,
        status: 'pending',
        paidAt: null,
        notes: input.notes ?? '',
        archived: false,
        createdAt: now,
        updatedAt: now,
      }
      list.value = [optimistic, ...list.value]
      await queueRequest('payments', 'CREATE', 'POST', '/api/payments', body)
    }
  }

  async function update(id: string, patch: UpdatePaymentPatch) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, ...patch }
    try {
      await $fetch(`/api/payments/${id}`, { method: 'PATCH', body: patch })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('payments', 'UPDATE', 'PATCH', `/api/payments/${id}`, patch)
    }
  }

  async function setPaid(id: string, paid: boolean) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) {
      list.value[idx] = {
        ...list.value[idx]!,
        status: paid ? 'paid' : 'pending',
        paidAt: paid ? new Date().toISOString() : null,
      }
    }
    try {
      await $fetch(`/api/payments/${id}/pay`, { method: 'POST', body: { paid } })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('payments', 'UPDATE', 'POST', `/api/payments/${id}/pay`, { paid })
    }
  }

  async function archive(id: string, archived = true) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, archived }
    try {
      await $fetch(`/api/payments/${id}/archive`, { method: 'POST', body: { archived } })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('payments', 'UPDATE', 'POST', `/api/payments/${id}/archive`, { archived })
    }
  }

  async function remove(id: string) {
    const idx = list.value.findIndex((p) => p.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value = list.value.filter((p) => p.id !== id)
    try {
      await $fetch(`/api/payments/${id}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        if (prev) list.value = [prev, ...list.value]
        throw e
      }
      await queueRequest('payments', 'DELETE', 'DELETE', `/api/payments/${id}`)
    }
  }

  return { list, summary, loading, error, refresh, create, update, setPaid, archive, remove }
}

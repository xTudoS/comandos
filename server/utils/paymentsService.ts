import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { payments } from '~~/server/db/schema'
import { auditedDelete, auditedUpdate, writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type PaymentRow = typeof payments.$inferSelect
export type PaymentStatus = PaymentRow['status']
export type PaymentKind = PaymentRow['kind']
export type PaymentRecurrence = PaymentRow['recurrence']

async function assertOwnedPayment(
  db: Db,
  args: { userId: string; paymentId: string },
): Promise<PaymentRow> {
  const [row] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, args.paymentId), eq(payments.ownerUserId, args.userId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Pagamento não encontrado.')
  return row
}

export async function listPayments(
  db: Db,
  args: {
    userId: string
    includeArchived?: boolean
    status?: PaymentStatus
    kind?: PaymentKind
  },
): Promise<PaymentRow[]> {
  const clauses = [eq(payments.ownerUserId, args.userId)]
  if (!args.includeArchived) clauses.push(eq(payments.archived, false))
  if (args.status) clauses.push(eq(payments.status, args.status))
  if (args.kind) clauses.push(eq(payments.kind, args.kind))
  return await db
    .select()
    .from(payments)
    .where(and(...clauses))
    .orderBy(desc(payments.dueDate), desc(payments.updatedAt))
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
  /** Saldo realizado lifetime (entradas confirmadas − saídas confirmadas, todas as datas). */
  balanceCents: number
  /** Saldo do mês — variação realizada apenas no mês corrente. */
  balanceMonthCents: number
  /** Saldo previsto se TODOS os pendentes (income e expense) forem confirmados. */
  forecastBalanceCents: number
}

/**
 * Aggregate counters for the /pagamentos header. Splits by kind so the wallet
 * view shows entrada vs saída. Three balances:
 * - `balanceCents`: lifetime realized (todas as confirmações)
 * - `balanceMonthCents`: variação no mês corrente
 * - `forecastBalanceCents`: lifetime + tudo que está pendente (entrada e saída)
 */
export async function paymentsSummary(
  db: Db,
  args: { userId: string },
): Promise<PaymentsSummary> {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  firstOfMonth.setHours(0, 0, 0, 0)

  const [pendingExpense] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        eq(payments.status, 'pending'),
        eq(payments.kind, 'expense'),
      ),
    )

  const [overdueExpense] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        eq(payments.status, 'pending'),
        eq(payments.kind, 'expense'),
        lt(payments.dueDate, today),
      ),
    )

  const [paidExpenseMonth] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        eq(payments.status, 'paid'),
        eq(payments.kind, 'expense'),
        gte(payments.paidAt, firstOfMonth),
      ),
    )

  const [paidExpenseLifetime] = await db
    .select({
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        eq(payments.status, 'paid'),
        eq(payments.kind, 'expense'),
      ),
    )

  const [pendingIncome] = await db
    .select({
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        eq(payments.status, 'pending'),
        eq(payments.kind, 'income'),
      ),
    )

  const [paidIncomeMonth] = await db
    .select({
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        eq(payments.status, 'paid'),
        eq(payments.kind, 'income'),
        gte(payments.paidAt, firstOfMonth),
      ),
    )

  const [paidIncomeLifetime] = await db
    .select({
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        eq(payments.status, 'paid'),
        eq(payments.kind, 'income'),
      ),
    )

  const incomePaidMonth = Number(paidIncomeMonth?.total ?? 0)
  const expensePaidMonth = Number(paidExpenseMonth?.total ?? 0)
  const incomePaidLifetime = Number(paidIncomeLifetime?.total ?? 0)
  const expensePaidLifetime = Number(paidExpenseLifetime?.total ?? 0)
  const incomePending = Number(pendingIncome?.total ?? 0)
  const expensePending = Number(pendingExpense?.total ?? 0)

  return {
    pendingCount: pendingExpense?.count ?? 0,
    pendingTotalCents: expensePending,
    overdueCount: overdueExpense?.count ?? 0,
    overdueTotalCents: Number(overdueExpense?.total ?? 0),
    paidMonthCount: paidExpenseMonth?.count ?? 0,
    paidMonthTotalCents: expensePaidMonth,
    incomePendingTotalCents: incomePending,
    incomePaidMonthTotalCents: incomePaidMonth,
    expensePaidMonthTotalCents: expensePaidMonth,
    balanceCents: incomePaidLifetime - expensePaidLifetime,
    balanceMonthCents: incomePaidMonth - expensePaidMonth,
    forecastBalanceCents:
      incomePaidLifetime - expensePaidLifetime + incomePending - expensePending,
  }
}

export async function getPayment(
  db: Db,
  args: { userId: string; paymentId: string },
): Promise<PaymentRow> {
  return await assertOwnedPayment(db, args)
}

export type CreatePaymentInput = {
  // Id gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale" após o sync. Ver server/api/payments/index.post.ts.
  id?: string
  description: string
  amountCents: number
  dueDate: string
  notes?: string
  kind?: PaymentKind
  recurrence?: PaymentRecurrence
  companyId?: string | null
}

export async function createPayment(
  db: Db,
  args: { userId: string; input: CreatePaymentInput },
): Promise<PaymentRow> {
  const description = args.input.description.trim()
  if (!description) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Descrição é obrigatória.')
  }
  if (!Number.isFinite(args.input.amountCents) || args.input.amountCents <= 0) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Valor deve ser maior que zero.')
  }
  if (!args.input.dueDate) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Data de vencimento é obrigatória.')
  }

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(payments)
      .values({
        ...(args.input.id ? { id: args.input.id } : {}),
        ownerUserId: args.userId,
        description,
        amountCents: args.input.amountCents,
        dueDate: args.input.dueDate,
        notes: args.input.notes ?? '',
        kind: args.input.kind ?? 'expense',
        recurrence: args.input.recurrence ?? 'none',
        companyId: args.input.companyId ?? null,
      })
      // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
      .onConflictDoNothing({ target: payments.id })
      .returning()
    if (!row) {
      if (args.input.id) {
        const [existing] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.id, args.input.id), eq(payments.ownerUserId, args.userId)))
          .limit(1)
        if (existing) return existing
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar pagamento.')
    }
    await writeAudit(tx, {
      entity: 'payment',
      entityId: row.id,
      action: 'create',
      actorUserId: args.userId,
      changes: {
        create: {
          description: row.description,
          amountCents: row.amountCents,
          dueDate: row.dueDate,
          kind: row.kind,
          recurrence: row.recurrence,
        },
      },
    })
    return row
  })
}

export type UpdatePaymentPatch = {
  description?: string
  amountCents?: number
  dueDate?: string
  notes?: string
  kind?: PaymentKind
  recurrence?: PaymentRecurrence
  companyId?: string | null
}

export async function updatePayment(
  db: Db,
  args: { userId: string; paymentId: string; patch: UpdatePaymentPatch },
): Promise<PaymentRow> {
  await assertOwnedPayment(db, args)
  const patch: Record<string, unknown> = { ...args.patch }
  if (patch.description !== undefined) {
    const d = String(patch.description).trim()
    if (!d) throw createApiError(ErrCode.BAD_REQUEST, 'Descrição não pode ser vazia.')
    patch.description = d
  }
  if (patch.amountCents !== undefined) {
    const n = Number(patch.amountCents)
    if (!Number.isFinite(n) || n <= 0) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Valor deve ser maior que zero.')
    }
    patch.amountCents = n
  }
  if (patch.dueDate !== undefined) {
    if (!patch.dueDate) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Data de vencimento é obrigatória.')
    }
  }
  if (Object.keys(patch).length === 0) {
    return await getPayment(db, args)
  }
  patch.updatedAt = new Date()
  return await db.transaction((tx) =>
    auditedUpdate<PaymentRow>(tx, payments, args.paymentId, args.userId, patch, {
      entity: 'payment',
    }),
  )
}

const RECURRENCE_DAYS: Record<PaymentRecurrence, number | null> = {
  none: null,
  weekly: 7,
  monthly: 0, // calendar-aware
  quarterly: 0, // calendar-aware
  yearly: 0, // calendar-aware
}

function nextDueDate(current: string, recurrence: PaymentRecurrence): string | null {
  if (recurrence === 'none') return null
  const [y, m, d] = current.split('-').map(Number)
  if (!y || !m || !d) return null
  const days = RECURRENCE_DAYS[recurrence]
  if (days && days > 0) {
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + days)
    return dt.toISOString().slice(0, 10)
  }
  // Calendar-aware bumps: preserve day-of-month, clamp to last valid day.
  let monthsAhead = 0
  if (recurrence === 'monthly') monthsAhead = 1
  else if (recurrence === 'quarterly') monthsAhead = 3
  else if (recurrence === 'yearly') monthsAhead = 12
  const target = new Date(Date.UTC(y, m - 1 + monthsAhead, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth()
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  const out = new Date(Date.UTC(targetYear, targetMonth, day))
  return out.toISOString().slice(0, 10)
}

export async function setPaymentPaid(
  db: Db,
  args: { userId: string; paymentId: string; paid: boolean },
): Promise<PaymentRow> {
  const current = await assertOwnedPayment(db, args)
  const wasPaid = current.status === 'paid'
  if (wasPaid === args.paid) return current

  const updated = await db.transaction((tx) =>
    auditedUpdate<PaymentRow>(
      tx,
      payments,
      args.paymentId,
      args.userId,
      {
        status: args.paid ? 'paid' : 'pending',
        paidAt: args.paid ? new Date() : null,
        updatedAt: new Date(),
      },
      { entity: 'payment' },
    ),
  )

  // When marking paid, materialize the next occurrence for recurring payments
  // (only if no child has been generated yet — guard against double-clicks).
  if (
    args.paid &&
    current.recurrence !== 'none' &&
    current.recurrenceParentId === null
  ) {
    const nextDate = nextDueDate(current.dueDate, current.recurrence)
    if (nextDate) {
      const [existingChild] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.recurrenceParentId, current.id))
        .limit(1)
      if (!existingChild) {
        await db.transaction(async (tx) => {
          const [child] = await tx
            .insert(payments)
            .values({
              ownerUserId: args.userId,
              description: current.description,
              amountCents: current.amountCents,
              dueDate: nextDate,
              notes: current.notes,
              kind: current.kind,
              recurrence: current.recurrence,
              recurrenceParentId: current.id,
            })
            .returning()
          if (child) {
            await writeAudit(tx, {
              entity: 'payment',
              entityId: child.id,
              action: 'create',
              actorUserId: args.userId,
              changes: {
                create: {
                  description: child.description,
                  amountCents: child.amountCents,
                  dueDate: child.dueDate,
                  recurrenceParentId: child.recurrenceParentId,
                },
              },
            })
          }
        })
      }
    }
  }

  return updated
}

export async function archivePayment(
  db: Db,
  args: { userId: string; paymentId: string; archived: boolean },
): Promise<PaymentRow> {
  await assertOwnedPayment(db, args)
  return await db.transaction((tx) =>
    auditedUpdate<PaymentRow>(
      tx,
      payments,
      args.paymentId,
      args.userId,
      { archived: args.archived, updatedAt: new Date() },
      { entity: 'payment' },
    ),
  )
}

export async function deletePayment(
  db: Db,
  args: { userId: string; paymentId: string },
): Promise<void> {
  await assertOwnedPayment(db, args)
  await db.transaction((tx) =>
    auditedDelete<PaymentRow>(tx, payments, args.paymentId, args.userId, {
      entity: 'payment',
    }),
  )
}

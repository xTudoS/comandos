import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  index,
  bigint,
  date,
} from 'drizzle-orm/pg-core'
import { users } from './auth'
import { companies } from './companies'

export const paymentStatus = pgEnum('payment_status', ['pending', 'paid'])
export const paymentKind = pgEnum('payment_kind', ['expense', 'income'])
export const paymentRecurrence = pgEnum('payment_recurrence', [
  'none',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
])

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date').notNull(),
    kind: paymentKind('kind').notNull().default('expense'),
    recurrence: paymentRecurrence('recurrence').notNull().default('none'),
    recurrenceParentId: uuid('recurrence_parent_id'),
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    status: paymentStatus('status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    notes: text('notes').notNull().default(''),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_owner_idx').on(t.ownerUserId, t.archived, t.status),
    index('payments_due_idx').on(t.dueDate),
    index('payments_kind_idx').on(t.ownerUserId, t.kind),
    index('payments_recurrence_idx').on(t.recurrenceParentId),
    index('payments_company_idx').on(t.companyId),
  ],
)

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'
import { companies } from './companies'
import { lifeArea } from './life'
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('general'),
    dueDate: date('due_date'),
    /** Empresa-canônica vinculada à meta (opcional). */
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    /** Área da vida — obrigatória quando category='personal'. */
    lifeArea: lifeArea('life_area'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('goals_owner_idx').on(t.ownerUserId, t.archived),
    index('goals_company_idx').on(t.companyId),
    uniqueIndex('goals_owner_title_lower_unique').on(t.ownerUserId, sql`lower(${t.title})`),
  ],
)

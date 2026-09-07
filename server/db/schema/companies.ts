import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'

/**
 * Empresas — entidades canônicas que podem ser referenciadas por
 * tarefas/metas/projetos. Nome é único por dono (case-insensitive) para que o
 * autocomplete consiga deduplicar quando o usuário digita o mesmo nome em
 * lugares diferentes.
 */
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('companies_owner_idx').on(t.ownerUserId, t.archived),
    uniqueIndex('companies_owner_name_lower_unique').on(
      t.ownerUserId,
      sql`lower(${t.name})`,
    ),
  ],
)

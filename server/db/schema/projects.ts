import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'
import { goals } from './goals'
import { companies } from './companies'
import { lifeArea } from './life'

export const projectCategory = pgEnum('project_category', [
  'company',
  'product',
  'general',
  'personal',
])

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: projectCategory('category').notNull().default('general'),
    parentProjectId: uuid('parent_project_id').references(
      (): AnyPgColumn => projects.id,
      { onDelete: 'set null' },
    ),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    /** Empresa-canônica vinculada. Para projetos category='empresa' o nome da empresa fica em sync com o nome do projeto. */
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    /** Área da vida — obrigatória quando category='personal'. */
    lifeArea: lifeArea('life_area'),
    /** Categoria-dependent extra field. Stores `{label, value}` so geral/pessoal can carry a freeform "Qual campo?" pair. */
    subjectLabel: text('subject_label').notNull().default(''),
    subjectValue: text('subject_value').notNull().default(''),
    notes: text('notes').notNull().default(''),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('projects_owner_idx').on(t.ownerUserId, t.archived),
    index('projects_parent_idx').on(t.parentProjectId),
    index('projects_goal_idx').on(t.goalId),
    index('projects_company_idx').on(t.companyId),
    uniqueIndex('projects_owner_name_lower_unique').on(t.ownerUserId, sql`lower(${t.name})`),
  ],
)

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './auth'
import { projects } from './projects'
import { companies } from './companies'

export const noteType = pgEnum('note_type', [
  'playbook',
  'credential',
  'contact',
  'decision',
  'reference',
])

export const noteStatus = pgEnum('note_status', ['active', 'draft'])

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    type: noteType('type').notNull().default('reference'),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    status: noteStatus('status').notNull().default('active'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notes_owner_idx').on(t.ownerUserId, t.archived, t.type),
    index('notes_project_idx').on(t.projectId),
    index('notes_company_idx').on(t.companyId),
  ],
)

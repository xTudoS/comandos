import {
  bigserial,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './auth'

export const auditAction = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'archive',
  'restore',
  'reassign',
  'complete',
  'uncomplete',
  'approve',
  'reject',
])

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: auditAction('action').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    changes: jsonb('changes'),
    context: jsonb('context'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId, t.at.desc()),
    index('audit_log_actor_idx').on(t.actorUserId, t.at.desc()),
  ],
)

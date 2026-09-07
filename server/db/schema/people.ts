import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'

export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
])

export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Email opcional — preenchido quando o owner adiciona via 'criar nova com email' no autocomplete. */
    email: text('email'),
    linkedUserId: uuid('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
    isAssistant: boolean('is_assistant').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('people_owner_idx').on(t.ownerUserId),
    index('people_linked_idx').on(t.linkedUserId),
    // At most one assistant per owner — partial unique on is_assistant=true.
    uniqueIndex('people_one_assistant_per_owner')
      .on(t.ownerUserId)
      .where(sql`${t.isAssistant} = true`),
  ],
)

export const personInvitations = pgTable(
  'person_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: invitationStatus('status').notNull().default('pending'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('person_invitations_person_idx').on(t.personId),
    index('person_invitations_pending_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
  ],
)

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  bigint,
} from 'drizzle-orm/pg-core'
import { users } from './auth'

/**
 * Polymorphic attachments — an attachment belongs to a parent entity
 * ({task, note, payment, project}, id). Access inherits from the parent;
 * we enforce this in the service layer, not via FK.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    originalFilename: text('original_filename').notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('attachments_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc()),
    index('attachments_uploader_idx').on(t.uploadedByUserId),
  ],
)

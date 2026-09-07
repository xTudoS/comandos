import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  inet,
  jsonb,
  bigint,
  customType,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users, sessions, passkeys } from './auth'


export const deviceApprovalStatus = pgEnum('device_approval_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
])

export const deviceApprovals = pgTable(
  'device_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    requestFingerprint: text('request_fingerprint').notNull(),
    requestUserAgent: text('request_user_agent'),
    requestIp: inet('request_ip'),
    status: deviceApprovalStatus('status').notNull().default('pending'),
    decidedBySessionId: uuid('decided_by_session_id'),
    decidedWithPasskeyId: uuid('decided_with_passkey_id').references(() => passkeys.id, {
      onDelete: 'set null',
    }),
    onboardingSessionId: uuid('onboarding_session_id'),
    decisionPayload: jsonb('decision_payload'),
    decisionSignature: text('decision_signature'),
    decisionClientData: text('decision_client_data'),
    decisionAuthenticatorData: text('decision_authenticator_data'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('device_approvals_user_recent_idx').on(t.userId, t.status, t.requestedAt.desc()),
    index('device_approvals_pending_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
  ],
)

export const rateLimitCounters = pgTable('rate_limit_counters', {
  key: text('key').primaryKey(),
  count: bigint('count', { mode: 'number' }).notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})

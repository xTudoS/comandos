import { pgTable, text, boolean, timestamp, uuid, integer, pgEnum } from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', ['owner', 'delegate'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: userRole('role').notNull().default('delegate'),
  /**
   * Quando o usuário terminou (ou pulou) o tour de boas-vindas.
   *
   * Timestamp e não booleano: "quando" responde "se", e ainda diz qual versão
   * do conteúdo a pessoa viu quando o tour mudar.
   *
   * Nada a ver com `sessions.kind = 'onboarding'`, que é sessão temporária de
   * aprovação de dispositivo (ver server/utils/approvalDecide.ts) — os nomes
   * colidem, os conceitos não.
   *
   * Nulo em quem já usava o app antes desta coluna: eles verão o tour uma vez.
   * É aceitável — é a única forma de distinguir "novo" de "antigo" sem uma
   * segunda coluna só para backfill.
   */
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessionKind = pgEnum('session_kind', ['user', 'onboarding'])

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  // Discriminator so a short-lived onboarding token can't be confused with a
  // real user session by any code that looks up sessions by token alone.
  // better-auth's own inserts don't pass this column and fall through to the
  // 'user' default; onboarding-session minting sets it explicitly.
  kind: sessionKind('kind').notNull().default('user'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passkeys = pgTable('passkeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name'),
  credentialID: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  deviceType: text('device_type').notNull().default(''),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: text('transports'),
  aaguid: text('aaguid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authChallenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeHash: text('challenge_hash').notNull(),
  payload: text('payload'),
  purpose: text('purpose').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

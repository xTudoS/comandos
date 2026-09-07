import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  date,
  timestamp,
  pgEnum,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'

/** Áreas da vida — espelha AREA_META no frontend (useLifeTracker.ts). */
export const lifeArea = pgEnum('life_area', [
  'corpo',
  'mente',
  'relacionamentos',
  'recursos',
  'experiencias',
])

export const trainingLevel = pgEnum('training_level', ['none', 'light', 'hard'])

/** Itens rastreados por área (Treino, Sono, Bianca…), nota 0–10. */
export const lifeItems = pgTable(
  'life_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    area: lifeArea('area').notNull(),
    name: text('name').notNull(),
    value: integer('value').notNull().default(7),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('life_items_owner_idx').on(t.ownerUserId, t.area, t.sortOrder),
    check('life_items_value_check', sql`${t.value} >= 0 AND ${t.value} <= 10`),
  ],
)

/** Check-in diário: 1 por usuário por dia (upsert). Alimenta itens de Corpo/Mente. */
export const lifeCheckins = pgTable(
  'life_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    sleepHours: real('sleep_hours').notNull().default(7),
    training: trainingLevel('training').notNull().default('none'),
    nutrition: integer('nutrition').notNull().default(7),
    mood: integer('mood').notNull().default(7),
    energy: integer('energy').notNull().default(7),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('life_checkins_owner_date_uq').on(t.ownerUserId, t.date),
    index('life_checkins_owner_idx').on(t.ownerUserId, t.date),
  ],
)

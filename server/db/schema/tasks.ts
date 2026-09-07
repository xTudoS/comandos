import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  index,
  integer,
  date,
  time,
  check,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'
import { people } from './people'
import { projects } from './projects'
import { goals } from './goals'
import { companies } from './companies'
import { lifeArea, lifeItems } from './life'

export const taskHorizon = pgEnum('task_horizon', [
  'core7',
  'core30',
  'core60',
  'core90',
  'hibernating',
])

export const taskType = pgEnum('task_type', ['ceo', 'delegate', 'personal'])

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delegatePersonId: uuid('delegate_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    horizon: taskHorizon('horizon').notNull().default('core30'),
    /** Flag de "ação rápida" (até ~30 min). Antes era um horizonte próprio;
     * agora é um destaque que pode coexistir com qualquer horizonte. */
    isMicro: boolean('is_micro').notNull().default(false),
    type: taskType('type').notNull().default('ceo'),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    /** Empresa direta (independente do projeto). Útil pra tasks soltas que envolvem um cliente sem precisar criar projeto. */
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    /** Área da vida impactada por esta tarefa (módulo Vida). Opcional. */
    lifeArea: lifeArea('life_area'),
    /** Item específico da área (ex.: uma pessoa em Relacionamentos). Opcional. */
    lifeItemId: uuid('life_item_id').references(() => lifeItems.id, {
      onDelete: 'set null',
    }),
    scheduledDate: date('scheduled_date'),
    scheduledTime: time('scheduled_time'),
    durationMinutes: integer('duration_minutes'),
    followupActive: boolean('followup_active').notNull().default(false),
    followupDate: date('followup_date'),
    followupHolderPersonId: uuid('followup_holder_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    followupDescription: text('followup_description'),
    done: boolean('done').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_owner_idx').on(t.ownerUserId, t.archived, t.horizon),
    index('tasks_delegate_idx').on(t.delegatePersonId),
    index('tasks_scheduled_idx').on(t.scheduledDate),
    index('tasks_goal_idx').on(t.goalId),
    index('tasks_company_idx').on(t.companyId),
    // A task is linked to AT MOST one of {project, goal}. When linked to a
    // project that itself belongs to a goal, the goal is reached transitively
    // via the project — no need to repeat it on the task row.
    check(
      'tasks_project_xor_goal_check',
      sql`${t.projectId} IS NULL OR ${t.goalId} IS NULL`,
    ),
  ],
)

/**
 * Convidados/participantes de uma tarefa (N pessoas por tarefa). Complementa o
 * `delegatePersonId` (dono da execução, no máximo um). Quando a pessoa tem conta
 * vinculada (`people.linked_user_id`), ser convidado DÁ acesso à tarefa no mesmo
 * nível do delegado — ver server/utils/accessFilter.ts. Sem conta vinculada é só
 * uma marca informativa (e o convite por email é o que fecha esse ciclo).
 */
export const taskParticipants = pgTable(
  'task_participants',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.personId] }),
    index('task_participants_person_idx').on(t.personId),
  ],
)

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('checklist_items_task_idx').on(t.taskId, t.position)],
)

export const taskAnnotations = pgTable(
  'task_annotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_annotations_task_time_idx').on(t.taskId, t.createdAt)],
)

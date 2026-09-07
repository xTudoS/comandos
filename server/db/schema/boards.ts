import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  unique,
  integer,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'
import { people } from './people'
import { tasks } from './tasks'

/**
 * Quadros customizados ("Trello do usuário"): o usuário cria o quadro, define as
 * colunas e coloca tarefas nelas manualmente. Diferente do board de horizontes
 * de /trabalho — que tem colunas fixas derivadas de `tasks.horizon` e ordem
 * sempre derivada dos dados — aqui a coluna e a posição são dado real, e mover
 * um card NÃO altera o horizonte da tarefa. Os dois eixos convivem.
 */
export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Nome de ícone do BaseIcon (lucide). */
    icon: text('icon').notNull().default('columns-3'),
    /** Cor de destaque na sidebar. Null = usa o accent padrão. */
    color: text('color'),
    /** Ordem na sidebar. */
    position: integer('position').notNull().default(0),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('boards_owner_idx').on(t.ownerUserId, t.archived),
    uniqueIndex('boards_owner_name_lower_unique').on(t.ownerUserId, sql`lower(${t.name})`),
  ],
)

export const boardColumns = pgTable(
  'board_columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('board_columns_board_idx').on(t.boardId, t.position),
    // Existe só para ser destino da FK composta de board_cards — é ela que
    // impede um card de apontar para a coluna de OUTRO quadro.
    //
    // `unique()` e não `uniqueIndex()`: precisa ser uma CONSTRAINT, criada
    // junto com a tabela. Como índice, o CREATE UNIQUE INDEX sai depois do
    // ALTER TABLE do FK e a migração quebra com "there is no unique constraint
    // matching given keys for referenced table".
    unique('board_columns_board_id_id_unique').on(t.boardId, t.id),
  ],
)

/**
 * Card = a presença de uma tarefa num quadro, com coluna e posição próprias.
 * A PK composta (board_id, task_id) é o que garante no banco que a tarefa
 * aparece no máximo UMA vez por quadro, permitindo ao mesmo tempo a mesma
 * tarefa em vários quadros com posição independente em cada um.
 */
export const boardCards = pgTable(
  'board_cards',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    columnId: uuid('column_id').notNull(),
    position: integer('position').notNull().default(0),
    addedByUserId: uuid('added_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.taskId] }),
    // FK composta: a coluna precisa pertencer ao MESMO quadro do card. Sem ela
    // dá pra gravar um card apontando pra coluna de outro quadro, e o defeito só
    // aparece quando alguém abre o quadro.
    foreignKey({
      columns: [t.boardId, t.columnId],
      foreignColumns: [boardColumns.boardId, boardColumns.id],
      name: 'board_cards_column_fk',
    }).onDelete('cascade'),
    index('board_cards_column_idx').on(t.columnId, t.position),
    // Atende o predicado de acesso por quadro em accessFilter.taskFilter.
    index('board_cards_task_idx').on(t.taskId),
  ],
)

/**
 * Membros do quadro. Espelha `task_participants`: o acesso só vale quando a
 * pessoa tem conta vinculada (`people.linked_user_id`). Ser membro DÁ acesso a
 * todas as tarefas do quadro — ver server/utils/accessFilter.ts.
 */
export const boardMembers = pgTable(
  'board_members',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.personId] }),
    index('board_members_person_idx').on(t.personId),
  ],
)

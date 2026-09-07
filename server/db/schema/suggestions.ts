import { pgTable, uuid, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { tasks } from './tasks'

/**
 * Sugestões da IA para os campos de uma tarefa.
 *
 * Tabela própria, e não colunas em `tasks`, por dois motivos:
 *  1. sugestão não é o estado da tarefa — misturar as duas coisas faria a
 *     linha responder "qual o horizonte?" com dois valores diferentes;
 *  2. a sugestão precisa sobreviver a um reload sem nunca ter sido aplicada.
 *
 * `payload` é jsonb porque o formato acompanha o prompt: hoje são campos e
 * perguntas, amanhã pode ser mais. Migração a cada ajuste de prompt seria
 * atrito sem retorno.
 *
 * Uma sugestão viva por tarefa — a criação apaga a anterior antes de inserir.
 */
export const taskSuggestions = pgTable(
  'task_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** `{ fields: {...}, questions: [...], reasoning?: string }` */
    payload: jsonb('payload').notNull(),
    /** Carimbo de quando o usuário aceitou (total ou parcialmente). */
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    /** Carimbo do "não, obrigado" — some da UI sem voltar. */
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_suggestions_task_idx').on(t.taskId, t.createdAt)],
)

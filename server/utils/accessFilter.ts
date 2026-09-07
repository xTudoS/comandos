import { and, eq, or, sql } from 'drizzle-orm'
import { tasks, taskParticipants, people, boards, boardCards, boardMembers } from '~~/server/db/schema'
import type { Db } from './db'

/**
 * Returns a Drizzle SQL<boolean> predicate for "this user can see the task".
 * Pass to `.where()` on any `tasks` query. The row matches when:
 *   - the user OWNS the task (tasks.owner_user_id), OR
 *   - the task is delegated to a person whose account is linked to the user
 *     (people.id = tasks.delegate_person_id AND people.linked_user_id = user), OR
 *   - the user is marked as a CONVIDADO (task_participants) através de uma
 *     pessoa cuja conta está vinculada a ele. Convidado tem o mesmo nível de
 *     acesso do delegado — ver, editar, concluir, arquivar, checklist,
 *     anotações e anexos. Só a reatribuição continua restrita ao criador, OU
 *   - a tarefa está num QUADRO que o usuário alcança (dono do quadro, ou membro
 *     através de uma pessoa com conta vinculada). Colocar uma tarefa num quadro
 *     compartilhado é, portanto, um ato de compartilhamento — a UI avisa antes.
 *     Tirar o card do quadro revoga esse acesso.
 *
 * Implemented as a single-SQL predicate so it composes with other WHERE
 * clauses and plays well with index scans on tasks_owner_idx. Cada ramo é um
 * EXISTS (não um JOIN), então a tarefa nunca duplica quando o usuário é
 * delegado E convidado da mesma linha.
 */
export function taskFilter(userId: string) {
  return or(
    eq(tasks.ownerUserId, userId),
    sql`EXISTS (
      SELECT 1 FROM ${people}
      WHERE ${people.id} = ${tasks.delegatePersonId}
        AND ${people.linkedUserId} = ${userId}
    )`,
    sql`EXISTS (
      SELECT 1 FROM ${taskParticipants}
      JOIN ${people} ON ${people.id} = ${taskParticipants.personId}
      WHERE ${taskParticipants.taskId} = ${tasks.id}
        AND ${people.linkedUserId} = ${userId}
    )`,
    // Acesso por quadro. Um EXISTS só cobre dono e membros, e o índice
    // board_cards_task_idx atende o predicado.
    sql`EXISTS (
      SELECT 1 FROM ${boardCards}
      JOIN ${boards} ON ${boards.id} = ${boardCards.boardId}
      WHERE ${boardCards.taskId} = ${tasks.id}
        AND (${boards.ownerUserId} = ${userId}
          OR EXISTS (
            SELECT 1 FROM ${boardMembers}
            JOIN ${people} ON ${people.id} = ${boardMembers.personId}
            WHERE ${boardMembers.boardId} = ${boards.id}
              AND ${people.linkedUserId} = ${userId}
          ))
    )`,
  )
}

/**
 * Async single-task access check. Use when you have a specific task id in
 * hand (e.g. PATCH/DELETE/read endpoints); for LIST queries use taskFilter
 * directly.
 */
export async function canAccessTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), taskFilter(userId)!))
    .limit(1)
  return rows.length > 0
}

import { and, asc, eq, sql } from 'drizzle-orm'
import { auditLog } from '~~/server/db/schema'
import { canAccessTask } from './accessFilter'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type Reschedule = {
  from: string | null
  to: string | null
  at: Date
  actorUserId: string | null
}

/**
 * Derives the reschedule history of a task from audit_log rows whose
 * `changes` jsonb carries a `scheduledDate` diff. The `?` operator is
 * Postgres jsonb "does this object have this top-level key". This is a
 * read-only derivation — no materialized table, no separate write path.
 */
export async function listReschedules(
  db: Db,
  args: { userId: string; taskId: string },
): Promise<Reschedule[]> {
  if (!(await canAccessTask(db, args.userId, args.taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }

  const rows = await db
    .select({
      changes: auditLog.changes,
      at: auditLog.at,
      actorUserId: auditLog.actorUserId,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'task'),
        eq(auditLog.entityId, args.taskId),
        sql`${auditLog.changes} ? 'scheduledDate'`,
      ),
    )
    .orderBy(asc(auditLog.at))

  return rows.map((r) => {
    const diff = (r.changes as { scheduledDate?: { from: string | null; to: string | null } })
      ?.scheduledDate
    return {
      from: diff?.from ?? null,
      to: diff?.to ?? null,
      at: r.at,
      actorUserId: r.actorUserId,
    }
  })
}

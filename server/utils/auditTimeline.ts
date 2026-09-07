import { and, asc, eq, or, sql } from 'drizzle-orm'
import { auditLog, users } from '~~/server/db/schema'
import { canAccessTask } from './accessFilter'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type TimelineEntry = {
  id: string
  entityType: string
  entityId: string
  action: string
  actorUserId: string | null
  actorName: string | null
  changes: unknown
  context: unknown
  at: Date
}

/**
 * Returns every audit_log row for a task, including its checklist items and
 * annotations, sorted chronologically ascending. Access-guarded by
 * canAccessTask so only owners + delegates see the feed.
 *
 * Child rows (checklist_item / task_annotation) are located via the
 * `context.taskId` field that every writeAudit / auditedUpdate /
 * auditedDelete call in those services populates — the audit log is the
 * source of truth even after the underlying rows have been deleted.
 */
export async function listTaskTimeline(
  db: Db,
  args: { userId: string; taskId: string },
): Promise<TimelineEntry[]> {
  if (!(await canAccessTask(db, args.userId, args.taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }

  const rows = await db
    .select({
      id: auditLog.id,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      actorUserId: auditLog.actorUserId,
      actorName: users.name,
      changes: auditLog.changes,
      context: auditLog.context,
      at: auditLog.at,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      or(
        and(eq(auditLog.entityType, 'task'), eq(auditLog.entityId, args.taskId)),
        and(
          eq(auditLog.entityType, 'checklist_item'),
          sql`${auditLog.context}->>'taskId' = ${args.taskId}`,
        ),
        and(
          eq(auditLog.entityType, 'task_annotation'),
          sql`${auditLog.context}->>'taskId' = ${args.taskId}`,
        ),
      ),
    )
    .orderBy(asc(auditLog.at))

  return rows.map((r) => ({
    id: String(r.id),
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    actorUserId: r.actorUserId,
    actorName: r.actorName,
    changes: r.changes,
    context: r.context,
    at: r.at,
  }))
}

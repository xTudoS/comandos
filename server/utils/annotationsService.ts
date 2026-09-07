import { and, asc, eq } from 'drizzle-orm'
import { tasks, taskAnnotations, users } from '~~/server/db/schema'
import { auditedDelete, writeAudit } from './audit'
import { canAccessTask } from './accessFilter'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type TaskAnnotationRow = typeof taskAnnotations.$inferSelect
export type AnnotationWithAuthor = TaskAnnotationRow & { authorName: string | null }

async function requireAccessToTask(db: Db, userId: string, taskId: string) {
  if (!(await canAccessTask(db, userId, taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
}

export async function listAnnotations(
  db: Db,
  args: { userId: string; taskId: string },
): Promise<AnnotationWithAuthor[]> {
  await requireAccessToTask(db, args.userId, args.taskId)
  const rows = await db
    .select({ a: taskAnnotations, authorName: users.name })
    .from(taskAnnotations)
    .leftJoin(users, eq(users.id, taskAnnotations.authorUserId))
    .where(eq(taskAnnotations.taskId, args.taskId))
    .orderBy(asc(taskAnnotations.createdAt))
  return rows.map((r) => ({ ...r.a, authorName: r.authorName }))
}

export async function createAnnotation(
  db: Db,
  args: { userId: string; taskId: string; body: string },
): Promise<TaskAnnotationRow> {
  await requireAccessToTask(db, args.userId, args.taskId)
  const body = args.body.trim()
  if (!body) throw createApiError(ErrCode.BAD_REQUEST, 'Anotação vazia.')

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(taskAnnotations)
      .values({ taskId: args.taskId, authorUserId: args.userId, body })
      .returning()
    if (!row) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar anotação.')
    await writeAudit(tx, {
      entity: 'task_annotation',
      entityId: row.id,
      action: 'create',
      actorUserId: args.userId,
      changes: { create: { body: row.body } },
      context: { taskId: args.taskId },
    })
    return row
  })
}

/**
 * Deletion is restricted: only the annotation's author OR the parent task's
 * creator can remove it. This keeps a delegate from erasing the owner's
 * notes (and vice versa) while preserving the owner's "my task, my call"
 * override.
 */
export async function deleteAnnotation(
  db: Db,
  args: { userId: string; taskId: string; annotationId: string },
): Promise<void> {
  await requireAccessToTask(db, args.userId, args.taskId)

  const [annotation] = await db
    .select()
    .from(taskAnnotations)
    .where(
      and(
        eq(taskAnnotations.id, args.annotationId),
        eq(taskAnnotations.taskId, args.taskId),
      ),
    )
    .limit(1)
  if (!annotation) throw createApiError(ErrCode.NOT_FOUND, 'Anotação não encontrada.')

  if (annotation.authorUserId !== args.userId) {
    const [task] = await db
      .select({ createdByUserId: tasks.createdByUserId })
      .from(tasks)
      .where(eq(tasks.id, args.taskId))
      .limit(1)
    if (!task || task.createdByUserId !== args.userId) {
      throw createApiError(ErrCode.FORBIDDEN, 'Só o autor ou o criador da tarefa pode remover.')
    }
  }

  await db.transaction((tx) =>
    auditedDelete<TaskAnnotationRow>(
      tx,
      taskAnnotations,
      args.annotationId,
      args.userId,
      { entity: 'task_annotation', context: { taskId: args.taskId } },
    ),
  )
}

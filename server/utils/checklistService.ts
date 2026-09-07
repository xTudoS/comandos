import { and, asc, desc, eq } from 'drizzle-orm'
import { checklistItems } from '~~/server/db/schema'
import { auditedDelete, auditedUpdate, writeAudit } from './audit'
import { canAccessTask } from './accessFilter'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type ChecklistItemRow = typeof checklistItems.$inferSelect

async function requireAccessToTask(db: Db, userId: string, taskId: string) {
  if (!(await canAccessTask(db, userId, taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
}

export async function listChecklist(
  db: Db,
  args: { userId: string; taskId: string },
): Promise<ChecklistItemRow[]> {
  await requireAccessToTask(db, args.userId, args.taskId)
  return await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.taskId, args.taskId))
    .orderBy(asc(checklistItems.position))
}

export async function createChecklistItem(
  db: Db,
  args: { userId: string; taskId: string; text: string },
): Promise<ChecklistItemRow> {
  await requireAccessToTask(db, args.userId, args.taskId)
  const text = args.text.trim()
  if (!text) throw createApiError(ErrCode.BAD_REQUEST, 'Item vazio.')

  return await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ position: checklistItems.position })
      .from(checklistItems)
      .where(eq(checklistItems.taskId, args.taskId))
      .orderBy(desc(checklistItems.position))
      .limit(1)
    const nextPos = (last?.position ?? -1) + 1

    const [row] = await tx
      .insert(checklistItems)
      .values({ taskId: args.taskId, text, position: nextPos })
      .returning()
    if (!row) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar item.')

    await writeAudit(tx, {
      entity: 'checklist_item',
      entityId: row.id,
      action: 'create',
      actorUserId: args.userId,
      changes: { create: { text: row.text, position: row.position } },
      context: { taskId: args.taskId },
    })
    return row
  })
}

export type ChecklistItemPatch = {
  text?: string
  done?: boolean
  position?: number
}

async function requireOwnedItem(
  db: Db,
  args: { taskId: string; itemId: string },
): Promise<ChecklistItemRow> {
  const [row] = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.id, args.itemId), eq(checklistItems.taskId, args.taskId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Item não encontrado.')
  return row
}

export async function updateChecklistItem(
  db: Db,
  args: { userId: string; taskId: string; itemId: string; patch: ChecklistItemPatch },
): Promise<ChecklistItemRow> {
  await requireAccessToTask(db, args.userId, args.taskId)
  const existing = await requireOwnedItem(db, args)

  const patch: Record<string, unknown> = {}
  if (args.patch.text !== undefined) {
    const trimmed = args.patch.text.trim()
    if (!trimmed) throw createApiError(ErrCode.BAD_REQUEST, 'Texto não pode ser vazio.')
    patch.text = trimmed
  }
  if (args.patch.position !== undefined) patch.position = args.patch.position

  if (args.patch.done !== undefined) {
    // Idempotent: skip the flip when already in target state to avoid
    // refreshing `doneAt` and writing audit noise.
    if (args.patch.done !== existing.done) {
      patch.done = args.patch.done
      patch.doneAt = args.patch.done ? new Date() : null
    }
  }

  if (Object.keys(patch).length === 0) return existing
  patch.updatedAt = new Date()

  return await db.transaction((tx) =>
    auditedUpdate<ChecklistItemRow>(
      tx,
      checklistItems,
      args.itemId,
      args.userId,
      patch,
      { entity: 'checklist_item', context: { taskId: args.taskId } },
    ),
  )
}

export async function deleteChecklistItem(
  db: Db,
  args: { userId: string; taskId: string; itemId: string },
): Promise<void> {
  await requireAccessToTask(db, args.userId, args.taskId)
  await requireOwnedItem(db, args)
  await db.transaction((tx) =>
    auditedDelete<ChecklistItemRow>(
      tx,
      checklistItems,
      args.itemId,
      args.userId,
      { entity: 'checklist_item', context: { taskId: args.taskId } },
    ),
  )
}

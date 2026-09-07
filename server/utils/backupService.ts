import { and, eq, inArray } from 'drizzle-orm'
import {
  attachments,
  checklistItems,
  notes,
  payments,
  people,
  projects,
  taskAnnotations,
  tasks,
} from '~~/server/db/schema'
import { writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export const BACKUP_SCHEMA_VERSION = 1

export type BackupPayload = {
  version: number
  exportedAt: string
  ownerUserId: string
  people: (typeof people.$inferSelect)[]
  projects: (typeof projects.$inferSelect)[]
  notes: (typeof notes.$inferSelect)[]
  payments: (typeof payments.$inferSelect)[]
  tasks: (typeof tasks.$inferSelect)[]
  checklistItems: (typeof checklistItems.$inferSelect)[]
  taskAnnotations: (typeof taskAnnotations.$inferSelect)[]
  attachments: (typeof attachments.$inferSelect)[]
}

/**
 * Builds a full backup of everything the user owns. Attachment rows are
 * included for completeness, but the blob data itself lives in S3 — a
 * restore against a different bucket would leave those rows pointing at
 * missing objects. That's an acceptable v1 tradeoff.
 */
export async function exportBackup(
  db: Db,
  args: { userId: string },
): Promise<BackupPayload> {
  const myPeople = await db
    .select()
    .from(people)
    .where(eq(people.ownerUserId, args.userId))

  const myProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerUserId, args.userId))

  const myNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.ownerUserId, args.userId))

  const myPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.ownerUserId, args.userId))

  // Tasks are more complex — they might be delegated to the user (accessible
  // but not owned). Backup only owned rows — delegated rows belong to the
  // other owner's backup.
  const myTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.ownerUserId, args.userId))

  const taskIds = myTasks.map((t) => t.id)
  const myChecklist = taskIds.length
    ? await db.select().from(checklistItems).where(inArray(checklistItems.taskId, taskIds))
    : []
  const myAnnotations = taskIds.length
    ? await db.select().from(taskAnnotations).where(inArray(taskAnnotations.taskId, taskIds))
    : []

  // Attachments: only those whose parent is owned by the user. We check
  // per entity kind to avoid leaking foreign rows (defence in depth even
  // though access would already be owner-scoped).
  const projectIds = myProjects.map((p) => p.id)
  const noteIds = myNotes.map((n) => n.id)
  const paymentIds = myPayments.map((p) => p.id)
  const myAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.uploadedByUserId, args.userId))
  const filteredAttachments = myAttachments.filter((a) => {
    if (a.entityType === 'task') return taskIds.includes(a.entityId)
    if (a.entityType === 'project') return projectIds.includes(a.entityId)
    if (a.entityType === 'note') return noteIds.includes(a.entityId)
    if (a.entityType === 'payment') return paymentIds.includes(a.entityId)
    return false
  })

  return {
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ownerUserId: args.userId,
    people: myPeople,
    projects: myProjects,
    notes: myNotes,
    payments: myPayments,
    tasks: myTasks,
    checklistItems: myChecklist,
    taskAnnotations: myAnnotations,
    attachments: filteredAttachments,
  }
}

export type ImportResult = {
  people: number
  projects: number
  notes: number
  payments: number
  tasks: number
  checklistItems: number
  taskAnnotations: number
  attachments: number
}

/**
 * Imports a backup for the authed user. Every row is written with a freshly
 * generated UUID; parent references inside the payload are remapped via
 * internal id-maps. This keeps the import fully additive — the user's
 * existing rows are untouched, and collisions with their current IDs are
 * impossible. Attachments are imported as metadata; the S3 objects are NOT
 * copied (they'd need a bucket-to-bucket copy, which is out of v1 scope).
 */
export async function importBackup(
  db: Db,
  args: { userId: string; payload: BackupPayload },
): Promise<ImportResult> {
  if (args.payload.version !== BACKUP_SCHEMA_VERSION) {
    throw createApiError(
      ErrCode.BAD_REQUEST,
      `Versão incompatível. Esperado ${BACKUP_SCHEMA_VERSION}, recebido ${args.payload.version}.`,
    )
  }

  const peopleMap = new Map<string, string>()
  const projectMap = new Map<string, string>()
  const noteMap = new Map<string, string>()
  const paymentMap = new Map<string, string>()
  const taskMap = new Map<string, string>()

  function newId(): string {
    return crypto.randomUUID()
  }

  const out: ImportResult = {
    people: 0,
    projects: 0,
    notes: 0,
    payments: 0,
    tasks: 0,
    checklistItems: 0,
    taskAnnotations: 0,
    attachments: 0,
  }

  await db.transaction(async (tx) => {
    for (const p of args.payload.people) {
      const id = newId()
      peopleMap.set(p.id, id)
      await tx.insert(people).values({
        id,
        ownerUserId: args.userId,
        name: p.name,
        // linked_user_id is deliberately dropped — re-establishing cross-user
        // links on import would leak references to other tenants.
        linkedUserId: null,
        // is_assistant is also dropped on import to avoid breaking the
        // partial-unique-index when the user already has an assistant.
        isAssistant: false,
        archived: p.archived,
      })
      out.people++
    }

    // Projects may reference parent projects — insert in two passes so we
    // can remap parent_project_id after every id is known.
    for (const p of args.payload.projects) {
      const id = newId()
      projectMap.set(p.id, id)
      await tx.insert(projects).values({
        id,
        ownerUserId: args.userId,
        name: p.name,
        category: p.category,
        parentProjectId: null,
        notes: p.notes,
        archived: p.archived,
      })
      out.projects++
    }
    for (const p of args.payload.projects) {
      if (!p.parentProjectId) continue
      const newIdForRow = projectMap.get(p.id)
      const mappedParent = projectMap.get(p.parentProjectId)
      if (!newIdForRow || !mappedParent) continue
      await tx
        .update(projects)
        .set({ parentProjectId: mappedParent })
        .where(eq(projects.id, newIdForRow))
    }

    for (const n of args.payload.notes) {
      const id = newId()
      noteMap.set(n.id, id)
      await tx.insert(notes).values({
        id,
        ownerUserId: args.userId,
        title: n.title,
        body: n.body,
        type: n.type,
        projectId: n.projectId ? (projectMap.get(n.projectId) ?? null) : null,
        status: n.status,
        archived: n.archived,
      })
      out.notes++
    }

    for (const p of args.payload.payments) {
      const id = newId()
      paymentMap.set(p.id, id)
      await tx.insert(payments).values({
        id,
        ownerUserId: args.userId,
        description: p.description,
        amountCents: p.amountCents,
        dueDate: p.dueDate,
        status: p.status,
        paidAt: p.paidAt,
        notes: p.notes,
        archived: p.archived,
      })
      out.payments++
    }

    for (const t of args.payload.tasks) {
      const id = newId()
      taskMap.set(t.id, id)
      await tx.insert(tasks).values({
        id,
        ownerUserId: args.userId,
        createdByUserId: args.userId,
        delegatePersonId: t.delegatePersonId ? (peopleMap.get(t.delegatePersonId) ?? null) : null,
        title: t.title,
        description: t.description,
        horizon: t.horizon,
        type: t.type,
        projectId: t.projectId ? (projectMap.get(t.projectId) ?? null) : null,
        scheduledDate: t.scheduledDate,
        scheduledTime: t.scheduledTime,
        durationMinutes: t.durationMinutes,
        followupActive: t.followupActive,
        followupDate: t.followupDate,
        followupHolderPersonId: t.followupHolderPersonId
          ? (peopleMap.get(t.followupHolderPersonId) ?? null)
          : null,
        done: t.done,
        completedAt: t.completedAt,
        archived: t.archived,
      })
      out.tasks++
    }

    for (const c of args.payload.checklistItems) {
      const mappedTask = taskMap.get(c.taskId)
      if (!mappedTask) continue
      await tx.insert(checklistItems).values({
        id: newId(),
        taskId: mappedTask,
        position: c.position,
        text: c.text,
        done: c.done,
        doneAt: c.doneAt,
      })
      out.checklistItems++
    }

    for (const a of args.payload.taskAnnotations) {
      const mappedTask = taskMap.get(a.taskId)
      if (!mappedTask) continue
      await tx.insert(taskAnnotations).values({
        id: newId(),
        taskId: mappedTask,
        authorUserId: args.userId,
        body: a.body,
      })
      out.taskAnnotations++
    }

    for (const att of args.payload.attachments) {
      let mappedEntityId: string | undefined
      if (att.entityType === 'task') mappedEntityId = taskMap.get(att.entityId)
      else if (att.entityType === 'project') mappedEntityId = projectMap.get(att.entityId)
      else if (att.entityType === 'note') mappedEntityId = noteMap.get(att.entityId)
      else if (att.entityType === 'payment') mappedEntityId = paymentMap.get(att.entityId)
      if (!mappedEntityId) continue
      await tx.insert(attachments).values({
        id: newId(),
        entityType: att.entityType,
        entityId: mappedEntityId,
        storageKey: att.storageKey,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        originalFilename: att.originalFilename,
        uploadedByUserId: args.userId,
      })
      out.attachments++
    }

    await writeAudit(tx, {
      entity: 'user',
      entityId: args.userId,
      action: 'create',
      actorUserId: args.userId,
      changes: { import: out },
      context: { action: 'import-backup', exportedAt: args.payload.exportedAt },
    })
  })

  return out
}

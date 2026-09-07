import { and, desc, eq } from 'drizzle-orm'
import { notes, projects } from '~~/server/db/schema'
import { auditedDelete, auditedUpdate, writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type NoteRow = typeof notes.$inferSelect
export type NoteType = NoteRow['type']
export type NoteStatus = NoteRow['status']

async function assertOwnedNote(
  db: Db,
  args: { userId: string; noteId: string },
): Promise<NoteRow> {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, args.noteId), eq(notes.ownerUserId, args.userId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Nota não encontrada.')
  return row
}

async function assertProjectOwnedBy(
  db: Db,
  args: { projectId: string; ownerUserId: string },
): Promise<void> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, args.projectId),
        eq(projects.ownerUserId, args.ownerUserId),
        eq(projects.archived, false),
      ),
    )
    .limit(1)
  if (!row) throw createApiError(ErrCode.BAD_REQUEST, 'Projeto não encontrado.')
}

export async function listNotes(
  db: Db,
  args: {
    userId: string
    includeArchived?: boolean
    type?: NoteType
    projectId?: string
  },
): Promise<NoteRow[]> {
  const clauses = [eq(notes.ownerUserId, args.userId)]
  if (!args.includeArchived) clauses.push(eq(notes.archived, false))
  if (args.type) clauses.push(eq(notes.type, args.type))
  if (args.projectId) clauses.push(eq(notes.projectId, args.projectId))
  return await db
    .select()
    .from(notes)
    .where(and(...clauses))
    .orderBy(desc(notes.updatedAt))
}

export async function getNote(
  db: Db,
  args: { userId: string; noteId: string },
): Promise<NoteRow> {
  return await assertOwnedNote(db, args)
}

export type CreateNoteInput = {
  // Id gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale"/duplicata após o sync. Ver server/api/notes/index.post.ts.
  id?: string
  title: string
  body?: string
  type?: NoteType
  projectId?: string | null
  companyId?: string | null
  status?: NoteStatus
}

export async function createNote(
  db: Db,
  args: { userId: string; input: CreateNoteInput },
): Promise<NoteRow> {
  const title = args.input.title.trim()
  if (!title) throw createApiError(ErrCode.BAD_REQUEST, 'Título é obrigatório.')

  if (args.input.projectId) {
    await assertProjectOwnedBy(db, {
      projectId: args.input.projectId,
      ownerUserId: args.userId,
    })
  }

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(notes)
      .values({
        ...(args.input.id ? { id: args.input.id } : {}),
        ownerUserId: args.userId,
        title,
        body: args.input.body ?? '',
        type: args.input.type ?? 'reference',
        projectId: args.input.projectId ?? null,
        companyId: args.input.companyId ?? null,
        status: args.input.status ?? 'active',
      })
      // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
      .onConflictDoNothing({ target: notes.id })
      .returning()
    if (!row) {
      if (args.input.id) {
        const [existing] = await tx
          .select()
          .from(notes)
          .where(and(eq(notes.id, args.input.id), eq(notes.ownerUserId, args.userId)))
          .limit(1)
        if (existing) return existing
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar nota.')
    }
    await writeAudit(tx, {
      entity: 'note',
      entityId: row.id,
      action: 'create',
      actorUserId: args.userId,
      changes: { create: { title: row.title, type: row.type, status: row.status } },
    })
    return row
  })
}

export type UpdateNotePatch = {
  title?: string
  body?: string
  type?: NoteType
  projectId?: string | null
  companyId?: string | null
  status?: NoteStatus
}

export async function updateNote(
  db: Db,
  args: { userId: string; noteId: string; patch: UpdateNotePatch },
): Promise<NoteRow> {
  await assertOwnedNote(db, args)

  const patch: Record<string, unknown> = { ...args.patch }
  if (patch.title !== undefined) {
    const t = String(patch.title).trim()
    if (!t) throw createApiError(ErrCode.BAD_REQUEST, 'Título não pode ser vazio.')
    patch.title = t
  }
  if (args.patch.projectId) {
    await assertProjectOwnedBy(db, {
      projectId: args.patch.projectId,
      ownerUserId: args.userId,
    })
  }
  if (Object.keys(patch).length === 0) {
    return await getNote(db, args)
  }
  patch.updatedAt = new Date()
  return await db.transaction((tx) =>
    auditedUpdate<NoteRow>(tx, notes, args.noteId, args.userId, patch, {
      entity: 'note',
    }),
  )
}

export async function archiveNote(
  db: Db,
  args: { userId: string; noteId: string; archived: boolean },
): Promise<NoteRow> {
  await assertOwnedNote(db, args)
  return await db.transaction((tx) =>
    auditedUpdate<NoteRow>(
      tx,
      notes,
      args.noteId,
      args.userId,
      { archived: args.archived, updatedAt: new Date() },
      { entity: 'note' },
    ),
  )
}

export async function deleteNote(
  db: Db,
  args: { userId: string; noteId: string },
): Promise<void> {
  await assertOwnedNote(db, args)
  await db.transaction((tx) =>
    auditedDelete<NoteRow>(tx, notes, args.noteId, args.userId, { entity: 'note' }),
  )
}

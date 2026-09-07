import { and, desc, eq } from 'drizzle-orm'
import {
  attachments,
  goals,
  notes,
  payments,
  projects,
  tasks,
} from '~~/server/db/schema'
import { canAccessTask } from './accessFilter'
import { writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import { deleteObject, presignDownload, presignUpload, readStorageEnv } from './storage'
import type { Db } from './db'

export type AttachmentEntity = 'task' | 'note' | 'payment' | 'project' | 'goal'
export type AttachmentRow = typeof attachments.$inferSelect

export const MAX_SIZE_BYTES = 25 * 1024 * 1024

// Minimal MIME whitelist — broad enough to cover everyday CEO files. The
// client already filters on the accept attribute; this is the backend
// safety net so untrusted callers can't stash executables.
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/pdf',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.',
]

function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? mime.startsWith(prefix) : mime === prefix,
  )
}

/**
 * Checks whether the given user can read+write attachments on the target
 * entity. Access always inherits from the parent — we don't have per-
 * attachment ACLs. Throws NOT_FOUND when the parent doesn't exist or the
 * user can't see it.
 */
async function assertCanAccessEntity(
  db: Db,
  args: { userId: string; entity: AttachmentEntity; entityId: string },
): Promise<void> {
  if (args.entity === 'task') {
    const ok = await canAccessTask(db, args.userId, args.entityId)
    if (!ok) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
    return
  }
  if (args.entity === 'note') {
    const [row] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, args.entityId), eq(notes.ownerUserId, args.userId)))
      .limit(1)
    if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Nota não encontrada.')
    return
  }
  if (args.entity === 'payment') {
    const [row] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, args.entityId), eq(payments.ownerUserId, args.userId)))
      .limit(1)
    if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Pagamento não encontrado.')
    return
  }
  if (args.entity === 'project') {
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, args.entityId), eq(projects.ownerUserId, args.userId)))
      .limit(1)
    if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Projeto não encontrado.')
    return
  }
  if (args.entity === 'goal') {
    const [row] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.id, args.entityId), eq(goals.ownerUserId, args.userId)))
      .limit(1)
    if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Meta não encontrada.')
    return
  }
  throw createApiError(ErrCode.BAD_REQUEST, 'Entidade inválida.')
}

export async function listAttachments(
  db: Db,
  args: { userId: string; entity: AttachmentEntity; entityId: string },
): Promise<AttachmentRow[]> {
  await assertCanAccessEntity(db, args)
  return await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.entityType, args.entity),
        eq(attachments.entityId, args.entityId),
      ),
    )
    .orderBy(desc(attachments.createdAt))
}

export type PresignUploadResult = {
  attachment: AttachmentRow
  uploadUrl: string
  expiresInSeconds: number
}

/**
 * Creates the attachment row AND returns a short-lived presigned PUT URL.
 * The client uploads directly to S3 with that URL; on success the row is
 * immediately usable. If the client fails to upload, the row stays orphaned
 * — we don't have a finalize step in v1 (cleanup job is a Phase 3 concern).
 */
export async function presignAttachmentUpload(
  db: Db,
  args: {
    userId: string
    entity: AttachmentEntity
    entityId: string
    filename: string
    mimeType: string
    sizeBytes: number
  },
): Promise<PresignUploadResult> {
  if (!readStorageEnv()) {
    throw createApiError(
      ErrCode.INTERNAL,
      'Storage não configurado — anexos indisponíveis.',
    )
  }
  const filename = args.filename.trim()
  if (!filename) throw createApiError(ErrCode.BAD_REQUEST, 'Nome do arquivo obrigatório.')
  if (!args.mimeType || !isMimeAllowed(args.mimeType)) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Tipo de arquivo não permitido.')
  }
  if (!Number.isFinite(args.sizeBytes) || args.sizeBytes <= 0) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Tamanho inválido.')
  }
  if (args.sizeBytes > MAX_SIZE_BYTES) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Arquivo excede 25 MB.')
  }
  await assertCanAccessEntity(db, args)

  const key = `${args.entity}/${args.entityId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`
  const uploadUrl = await presignUpload({ key, mimeType: args.mimeType })

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(attachments)
      .values({
        entityType: args.entity,
        entityId: args.entityId,
        storageKey: key,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        originalFilename: filename,
        uploadedByUserId: args.userId,
      })
      .returning()
    if (!created) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar anexo.')
    await writeAudit(tx, {
      entity: 'attachment',
      entityId: created.id,
      action: 'create',
      actorUserId: args.userId,
      changes: {
        create: {
          parent: { entity: args.entity, id: args.entityId },
          filename,
          mimeType: args.mimeType,
          sizeBytes: args.sizeBytes,
        },
      },
    })
    return created
  })

  return { attachment: row, uploadUrl, expiresInSeconds: 600 }
}

export async function getDownloadUrl(
  db: Db,
  args: { userId: string; attachmentId: string },
): Promise<string> {
  if (!readStorageEnv()) {
    throw createApiError(
      ErrCode.INTERNAL,
      'Storage não configurado — anexos indisponíveis.',
    )
  }
  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, args.attachmentId))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Anexo não encontrado.')
  await assertCanAccessEntity(db, {
    userId: args.userId,
    entity: row.entityType as AttachmentEntity,
    entityId: row.entityId,
  })
  return await presignDownload({ key: row.storageKey, filename: row.originalFilename })
}

export async function deleteAttachment(
  db: Db,
  args: { userId: string; attachmentId: string },
): Promise<void> {
  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, args.attachmentId))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Anexo não encontrado.')
  await assertCanAccessEntity(db, {
    userId: args.userId,
    entity: row.entityType as AttachmentEntity,
    entityId: row.entityId,
  })

  // Best-effort object delete — if storage is misconfigured or the object
  // was never uploaded, we still clear the row. Orphaned objects are a
  // cheaper problem than orphaned rows.
  if (readStorageEnv()) {
    try {
      await deleteObject({ key: row.storageKey })
    } catch (e) {
      console.error('attachments.delete: storage delete failed', e)
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, args.attachmentId))
    await writeAudit(tx, {
      entity: 'attachment',
      entityId: args.attachmentId,
      action: 'delete',
      actorUserId: args.userId,
      changes: {
        delete: {
          parent: { entity: row.entityType, id: row.entityId },
          filename: row.originalFilename,
        },
      },
    })
  })
}

function sanitizeFilename(s: string): string {
  // Keep a readable slug in the key for debugging — strip path chars and
  // anything that would need URL escaping.
  return s
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
}

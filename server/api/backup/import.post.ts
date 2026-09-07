import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { importBackup, type BackupPayload } from '~~/server/utils/backupService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

// Permissive schema — individual row validation happens downstream via
// drizzle's column types. The top-level shape guards against a wildly
// malformed payload (e.g. someone uploading a CSV by mistake).
const payloadSchema = z.object({
  version: z.number().int().positive(),
  exportedAt: z.string(),
  ownerUserId: z.string().uuid(),
  people: z.array(z.record(z.string(), z.unknown())),
  projects: z.array(z.record(z.string(), z.unknown())),
  notes: z.array(z.record(z.string(), z.unknown())),
  payments: z.array(z.record(z.string(), z.unknown())),
  tasks: z.array(z.record(z.string(), z.unknown())),
  checklistItems: z.array(z.record(z.string(), z.unknown())),
  taskAnnotations: z.array(z.record(z.string(), z.unknown())),
  attachments: z.array(z.record(z.string(), z.unknown())),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const parsed = payloadSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Backup inválido.')
  }
  const db = useDb(event)
  const result = await importBackup(db, {
    userId: user.id,
    payload: parsed.data as unknown as BackupPayload,
  })
  return { ok: true, imported: result }
})

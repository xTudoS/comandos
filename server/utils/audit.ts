import { eq } from 'drizzle-orm'
import { auditLog } from '~~/server/db/schema'
import type { Db } from './db'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'archive'
  | 'restore'
  | 'reassign'
  | 'complete'
  | 'uncomplete'
  | 'approve'
  | 'reject'

// Minimal shape both `Db` and a drizzle transaction satisfy. Typing against
// the actual PgTransaction would force generic parameters we don't care
// about here; we only need the four ORM methods we call.
type AuditTx = Pick<Db, 'insert' | 'select' | 'update'>

/**
 * Writes a single audit_log row. Accepts any Drizzle `Db` or a transaction
 * — both expose `.insert(...)` with a compatible shape — so callers can batch
 * the audit write inside a larger transaction for atomicity.
 */
export async function writeAudit(
  tx: Pick<Db, 'insert'>,
  args: {
    entity: string
    entityId: string
    action: AuditAction
    actorUserId: string | null
    changes?: unknown
    context?: unknown
  },
) {
  await tx.insert(auditLog).values({
    entityType: args.entity,
    entityId: args.entityId,
    action: args.action,
    actorUserId: args.actorUserId,
    changes: args.changes ?? null,
    context: args.context ?? null,
  })
}

// Columns that are noise for audit purposes — mtime-style bookkeeping that
// always differs between before/after even when nothing semantic changed.
// Callers can extend via `opts.ignore`.
const DEFAULT_IGNORED_FIELDS: ReadonlySet<string> = new Set([
  'updatedAt',
  'updated_at',
  'atualizadaEm',
  'atualizada_em',
])

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    // Good enough for the JSON-safe shapes we store (patches + drizzle rows).
    // Don't substitute for real structural equality in hot paths.
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/**
 * Returns the per-field diff between two records, keyed by the column name
 * and reporting `{ from, to }`. Skips columns listed in `opts.ignore` plus a
 * baseline set of mtime-style columns. Only keys that appear in either
 * `before` or `after` are considered — a patch with `{ title: undefined }`
 * leaves title alone in both, so it won't surface as a change.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  opts: { ignore?: readonly string[] } = {},
): Record<string, { from: unknown; to: unknown }> {
  const ignore = new Set<string>([...DEFAULT_IGNORED_FIELDS, ...(opts.ignore ?? [])])
  const out: Record<string, { from: unknown; to: unknown }> = {}
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const k of keys) {
    if (ignore.has(k)) continue
    const a = (before ?? {})[k]
    const b = (after ?? {})[k]
    if (!deepEqual(a, b)) out[k] = { from: a, to: b }
  }
  return out
}

/**
 * Infers the semantic action for a patch based on which domain flags flipped.
 * Precedence: done > archived > reassign > update. The patch is inspected so
 * that changes NOT present in the patch (but different because of unrelated
 * updates) don't hijack the action — e.g. a plain rename that happens to
 * re-fetch a stale `done=false` row won't register as 'uncomplete'.
 */
export function inferAction(
  patch: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): AuditAction {
  if ('done' in patch) {
    if (after.done && !before.done) return 'complete'
    if (!after.done && before.done) return 'uncomplete'
  }
  if ('archived' in patch) {
    if (after.archived && !before.archived) return 'archive'
    if (!after.archived && before.archived) return 'restore'
  }
  if ('delegatePersonId' in patch || 'delegate_person_id' in patch) return 'reassign'
  return 'update'
}

/**
 * Wrapper around an UPDATE that also writes a diff row to audit_log when the
 * patch actually changes something. Returns the updated row.
 *
 * Threw-instead-of-returned: this util is intentionally strict — if the row
 * doesn't exist, it throws; callers should check existence first or handle
 * the error. The audit row is only written when `diffFields` returns at
 * least one change, so a no-op patch produces no audit noise.
 */
export async function auditedUpdate<TRow extends Record<string, unknown> & { id: string }>(
  tx: AuditTx,
  table: { id: unknown } & Parameters<AuditTx['update']>[0],
  id: string,
  actorUserId: string | null,
  patch: Record<string, unknown>,
  opts: { entity: string; context?: unknown; ignore?: readonly string[] },
): Promise<TRow> {
  const idColumn = (table as { id: Parameters<typeof eq>[0] }).id
  const [before] = (await tx.select().from(table).where(eq(idColumn, id)).limit(1)) as TRow[]
  if (!before) throw new Error(`auditedUpdate: ${opts.entity}#${id} not found`)

  const [after] = (await tx
    .update(table)
    .set(patch)
    .where(eq(idColumn, id))
    .returning()) as TRow[]
  if (!after) throw new Error(`auditedUpdate: ${opts.entity}#${id} vanished during update`)

  const changes = diffFields(before, after, { ignore: opts.ignore })
  if (Object.keys(changes).length === 0) return after

  await writeAudit(tx, {
    entity: opts.entity,
    entityId: id,
    action: inferAction(patch, before, after),
    actorUserId,
    changes,
    context: opts.context,
  })
  return after
}

type AuditDeleteTx = AuditTx & Pick<Db, 'delete'>

/**
 * Hard-deletes a row and writes a `delete` audit row with a snapshot of the
 * row's pre-deletion state in `changes.delete`. Throws when the row doesn't
 * exist — callers should ownership-check before calling.
 */
export async function auditedDelete<TRow extends Record<string, unknown> & { id: string }>(
  tx: AuditDeleteTx,
  table: { id: unknown } & Parameters<AuditDeleteTx['delete']>[0],
  id: string,
  actorUserId: string | null,
  opts: { entity: string; context?: unknown },
): Promise<TRow> {
  const idColumn = (table as { id: Parameters<typeof eq>[0] }).id
  const [before] = (await tx.select().from(table).where(eq(idColumn, id)).limit(1)) as TRow[]
  if (!before) throw new Error(`auditedDelete: ${opts.entity}#${id} not found`)

  await tx.delete(table).where(eq(idColumn, id))

  await writeAudit(tx, {
    entity: opts.entity,
    entityId: id,
    action: 'delete',
    actorUserId,
    changes: { delete: before },
    context: opts.context,
  })
  return before
}

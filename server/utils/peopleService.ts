import { and, asc, eq } from 'drizzle-orm'
import { people } from '~~/server/db/schema'
import { auditedUpdate, writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type PersonRow = typeof people.$inferSelect

export async function listPeople(
  db: Db,
  args: { ownerUserId: string; includeArchived?: boolean },
): Promise<PersonRow[]> {
  const conditions = args.includeArchived
    ? eq(people.ownerUserId, args.ownerUserId)
    : and(eq(people.ownerUserId, args.ownerUserId), eq(people.archived, false))
  return await db.select().from(people).where(conditions).orderBy(asc(people.name))
}

/**
 * Garante que a pessoa existe, é do owner e não está arquivada. Devolve a linha
 * (nome/email/conta vinculada) — quem precisa só da checagem pode ignorar.
 *
 * Todo ponteiro para `people` gravado em outra entidade (delegado, convidado,
 * membro de quadro) passa por aqui: as FKs são `onDelete: set null`/`cascade` e
 * não checam propriedade no insert.
 */
export async function assertPersonOwnedBy(
  db: Db,
  args: { personId: string; ownerUserId: string; errMessage: string },
): Promise<{ id: string; name: string; email: string | null; linkedUserId: string | null }> {
  const [person] = await db
    .select({
      id: people.id,
      name: people.name,
      email: people.email,
      linkedUserId: people.linkedUserId,
    })
    .from(people)
    .where(
      and(
        eq(people.id, args.personId),
        eq(people.ownerUserId, args.ownerUserId),
        eq(people.archived, false),
      ),
    )
    .limit(1)
  if (!person) throw createApiError(ErrCode.BAD_REQUEST, args.errMessage)
  return person
}

function normalizeName(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw createApiError(ErrCode.BAD_REQUEST, 'Nome não pode ser vazio.')
  return trimmed
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  // Lightweight validation — RFC 5322 is overkill here. We just want to
  // catch garbage like "asdf" so it doesn't end up persisted.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Email inválido.')
  }
  return trimmed
}

export async function createPerson(
  db: Db,
  // Id gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale" após o sync. Ver server/api/people/index.post.ts.
  args: { id?: string; ownerUserId: string; name: string; email?: string | null },
): Promise<PersonRow> {
  const name = normalizeName(args.name)
  const email = normalizeEmail(args.email)
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(people)
      .values({ ...(args.id ? { id: args.id } : {}), ownerUserId: args.ownerUserId, name, email })
      // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
      .onConflictDoNothing({ target: people.id })
      .returning()
    if (!row) {
      if (args.id) {
        const [existing] = await tx
          .select()
          .from(people)
          .where(and(eq(people.id, args.id), eq(people.ownerUserId, args.ownerUserId)))
          .limit(1)
        if (existing) return existing
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar pessoa.')
    }
    await writeAudit(tx, {
      entity: 'person',
      entityId: row.id,
      action: 'create',
      actorUserId: args.ownerUserId,
      changes: { create: { name: row.name, email: row.email } },
    })
    return row
  })
}

async function requireOwnedPerson(
  db: Db,
  args: { ownerUserId: string; personId: string },
): Promise<PersonRow> {
  const [row] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, args.personId), eq(people.ownerUserId, args.ownerUserId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Pessoa não encontrada.')
  return row
}

export async function updatePerson(
  db: Db,
  args: {
    ownerUserId: string
    personId: string
    patch: { name?: string; email?: string | null }
  },
): Promise<PersonRow> {
  const current = await requireOwnedPerson(db, args)
  const normalized: { name?: string; email?: string | null } = {}
  if (args.patch.name !== undefined) normalized.name = normalizeName(args.patch.name)
  if (args.patch.email !== undefined) normalized.email = normalizeEmail(args.patch.email)
  if (Object.keys(normalized).length === 0) {
    // No-op patch — avoid drizzle's "no values to set" error and skip the
    // pointless round-trip entirely.
    return current
  }
  return await db.transaction((tx) =>
    auditedUpdate<PersonRow>(tx, people, args.personId, args.ownerUserId, normalized, {
      entity: 'person',
    }),
  )
}

export async function archivePerson(
  db: Db,
  args: { ownerUserId: string; personId: string },
): Promise<PersonRow> {
  await requireOwnedPerson(db, args)
  return await db.transaction((tx) =>
    auditedUpdate<PersonRow>(
      tx,
      people,
      args.personId,
      args.ownerUserId,
      { archived: true },
      { entity: 'person' },
    ),
  )
}

/**
 * Promotes `personId` as the owner's assistant, demoting any prior assistant
 * in the same transaction. Enforces the domain invariant "at most one
 * assistant per owner" at two levels: application-level (demote first,
 * promote second) and schema-level (partial unique index catches races).
 *
 * A person without a linked user account can't act as an assistant — they
 * have no way to receive delegated tasks — so we reject at 400.
 */
export async function setAssistant(
  db: Db,
  args: { ownerUserId: string; personId: string },
): Promise<PersonRow> {
  const target = await requireOwnedPerson(db, args)
  if (!target.linkedUserId) {
    throw createApiError(
      ErrCode.BAD_REQUEST,
      'Pessoa precisa ter conta aceita para virar assistente.',
    )
  }
  if (target.archived) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Pessoa arquivada não pode ser assistente.')
  }
  if (target.isAssistant) return target

  return await db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(people)
      .where(and(eq(people.ownerUserId, args.ownerUserId), eq(people.isAssistant, true)))
      .limit(1)
    if (previous && previous.id !== args.personId) {
      await auditedUpdate<PersonRow>(
        tx,
        people,
        previous.id,
        args.ownerUserId,
        { isAssistant: false },
        { entity: 'person', context: { reason: 'demoted when another assistant was set' } },
      )
    }
    return await auditedUpdate<PersonRow>(
      tx,
      people,
      args.personId,
      args.ownerUserId,
      { isAssistant: true },
      { entity: 'person' },
    )
  })
}

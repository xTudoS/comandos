import { and, asc, eq, sql } from 'drizzle-orm'
import { companies, goals, projects, tasks } from '~~/server/db/schema'
import { auditedDelete, auditedUpdate, writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type CompanyRow = typeof companies.$inferSelect

export type CompanyCounts = {
  taskTotal: number
  taskOpen: number
  projectTotal: number
  goalTotal: number
}

export type CompanyWithCounts = CompanyRow & { counts: CompanyCounts }

function normalizeName(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Nome da empresa não pode ser vazio.')
  }
  if (trimmed.length > 200) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Nome da empresa muito longo.')
  }
  return trimmed
}

export async function listCompanies(
  db: Db,
  args: { ownerUserId: string; includeArchived?: boolean },
): Promise<CompanyRow[]> {
  const conditions = args.includeArchived
    ? eq(companies.ownerUserId, args.ownerUserId)
    : and(eq(companies.ownerUserId, args.ownerUserId), eq(companies.archived, false))
  return await db
    .select()
    .from(companies)
    .where(conditions)
    .orderBy(asc(companies.name))
}

export async function listCompaniesWithCounts(
  db: Db,
  args: { ownerUserId: string; includeArchived?: boolean },
): Promise<CompanyWithCounts[]> {
  const rows = await listCompanies(db, args)
  if (rows.length === 0) return []

  // 3 round-trips agregados — cheap o suficiente pra não justificar UNION ALL.
  const tasksByCompany = await db
    .select({
      companyId: tasks.companyId,
      total: sql<number>`count(*)::int`,
      open: sql<number>`sum(case when ${tasks.done} = false then 1 else 0 end)::int`,
    })
    .from(tasks)
    .where(
      and(eq(tasks.ownerUserId, args.ownerUserId), eq(tasks.archived, false)),
    )
    .groupBy(tasks.companyId)

  const projectsByCompany = await db
    .select({
      companyId: projects.companyId,
      total: sql<number>`count(*)::int`,
    })
    .from(projects)
    .where(
      and(eq(projects.ownerUserId, args.ownerUserId), eq(projects.archived, false)),
    )
    .groupBy(projects.companyId)

  const goalsByCompany = await db
    .select({
      companyId: goals.companyId,
      total: sql<number>`count(*)::int`,
    })
    .from(goals)
    .where(and(eq(goals.ownerUserId, args.ownerUserId), eq(goals.archived, false)))
    .groupBy(goals.companyId)

  const tMap = new Map<string, { total: number; open: number }>()
  for (const r of tasksByCompany) {
    if (!r.companyId) continue
    tMap.set(r.companyId, { total: r.total ?? 0, open: r.open ?? 0 })
  }
  const pMap = new Map<string, number>()
  for (const r of projectsByCompany) {
    if (!r.companyId) continue
    pMap.set(r.companyId, r.total ?? 0)
  }
  const gMap = new Map<string, number>()
  for (const r of goalsByCompany) {
    if (!r.companyId) continue
    gMap.set(r.companyId, r.total ?? 0)
  }

  return rows.map((c) => ({
    ...c,
    counts: {
      taskTotal: tMap.get(c.id)?.total ?? 0,
      taskOpen: tMap.get(c.id)?.open ?? 0,
      projectTotal: pMap.get(c.id) ?? 0,
      goalTotal: gMap.get(c.id) ?? 0,
    },
  }))
}

/**
 * Idempotent get-or-create por nome (case-insensitive). Útil quando a UI quer
 * resolver "digitei 'Acme'" para um id, sem se importar se já existia.
 */
export async function upsertCompanyByName(
  db: Db,
  // id gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale" após o sync. Ver server/api/companies/index.post.ts.
  args: { ownerUserId: string; name: string; id?: string },
): Promise<CompanyRow> {
  const name = normalizeName(args.name)
  // Tenta find primeiro pra evitar audit ruidoso quando já existe.
  const [existing] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.ownerUserId, args.ownerUserId),
        sql`lower(${companies.name}) = lower(${name})`,
      ),
    )
    .limit(1)
  if (existing) {
    if (existing.archived) {
      // Reativa silenciosamente — o usuário não deveria precisar saber que
      // a empresa estava arquivada.
      const [reactivated] = await db
        .update(companies)
        .set({ archived: false, updatedAt: new Date() })
        .where(eq(companies.id, existing.id))
        .returning()
      return reactivated ?? existing
    }
    return existing
  }
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(companies)
      .values({ ...(args.id ? { id: args.id } : {}), ownerUserId: args.ownerUserId, name })
      // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
      .onConflictDoNothing({ target: companies.id })
      .returning()
    if (!row) {
      if (args.id) {
        const [existing] = await tx
          .select()
          .from(companies)
          .where(and(eq(companies.id, args.id), eq(companies.ownerUserId, args.ownerUserId)))
          .limit(1)
        if (existing) return existing
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar empresa.')
    }
    await writeAudit(tx, {
      entity: 'company',
      entityId: row.id,
      action: 'create',
      actorUserId: args.ownerUserId,
      changes: { create: { name: row.name } },
    })
    return row
  })
}

export async function createCompany(
  db: Db,
  args: { ownerUserId: string; name: string; id?: string },
): Promise<CompanyRow> {
  return await upsertCompanyByName(db, args)
}

async function requireOwnedCompany(
  db: Db,
  args: { ownerUserId: string; companyId: string },
): Promise<CompanyRow> {
  const [row] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.id, args.companyId),
        eq(companies.ownerUserId, args.ownerUserId),
      ),
    )
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Empresa não encontrada.')
  return row
}

export async function assertCompanyOwnedBy(
  db: Db,
  args: { ownerUserId: string; companyId: string },
): Promise<void> {
  await requireOwnedCompany(db, args)
}

export async function updateCompany(
  db: Db,
  args: { ownerUserId: string; companyId: string; patch: { name?: string } },
): Promise<CompanyRow> {
  await requireOwnedCompany(db, args)
  const normalized: { name?: string } = {}
  if (args.patch.name !== undefined) normalized.name = normalizeName(args.patch.name)
  if (Object.keys(normalized).length === 0) {
    return await requireOwnedCompany(db, args)
  }
  return await db.transaction((tx) =>
    auditedUpdate<CompanyRow>(
      tx,
      companies,
      args.companyId,
      args.ownerUserId,
      { ...normalized, updatedAt: new Date() },
      { entity: 'company' },
    ),
  )
}

export async function archiveCompany(
  db: Db,
  args: { ownerUserId: string; companyId: string; archived: boolean },
): Promise<CompanyRow> {
  await requireOwnedCompany(db, args)
  return await db.transaction((tx) =>
    auditedUpdate<CompanyRow>(
      tx,
      companies,
      args.companyId,
      args.ownerUserId,
      { archived: args.archived, updatedAt: new Date() },
      { entity: 'company' },
    ),
  )
}

export async function deleteCompany(
  db: Db,
  args: { ownerUserId: string; companyId: string },
): Promise<void> {
  // FKs em tasks/projects/goals usam ON DELETE SET NULL — o delete só remove
  // a entrada canônica, deixando os links órfãos automaticamente.
  await requireOwnedCompany(db, args)
  await db.transaction((tx) =>
    auditedDelete<CompanyRow>(tx, companies, args.companyId, args.ownerUserId, {
      entity: 'company',
    }),
  )
}

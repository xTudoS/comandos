import { and, desc, eq } from 'drizzle-orm'
import { goals, projects, tasks } from '~~/server/db/schema'
import { auditedDelete, auditedUpdate, writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type ProjectRow = typeof projects.$inferSelect
export type ProjectCategory = ProjectRow['category']

async function assertOwnedGoal(
  db: Db,
  args: { userId: string; goalId: string },
): Promise<void> {
  const [row] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, args.goalId), eq(goals.ownerUserId, args.userId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.BAD_REQUEST, 'Meta não encontrada.')
}

async function assertOwnedProject(
  db: Db,
  args: { userId: string; projectId: string },
): Promise<ProjectRow> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, args.projectId), eq(projects.ownerUserId, args.userId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Projeto não encontrado.')
  return row
}

export async function listProjects(
  db: Db,
  args: { userId: string; includeArchived?: boolean },
): Promise<ProjectRow[]> {
  const filter = args.includeArchived
    ? eq(projects.ownerUserId, args.userId)
    : and(eq(projects.ownerUserId, args.userId), eq(projects.archived, false))
  return await db.select().from(projects).where(filter).orderBy(desc(projects.createdAt))
}

export async function getProject(
  db: Db,
  args: { userId: string; projectId: string },
): Promise<ProjectRow> {
  return await assertOwnedProject(db, args)
}

export type CreateProjectInput = {
  // Id gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale" após o sync. Ver server/api/projects/index.post.ts.
  id?: string
  name: string
  category?: ProjectCategory
  parentProjectId?: string | null
  goalId?: string | null
  companyId?: string | null
  notes?: string
  subjectLabel?: string
  subjectValue?: string
  lifeArea?: ProjectRow['lifeArea']
}

export async function createProject(
  db: Db,
  args: { userId: string; input: CreateProjectInput },
): Promise<ProjectRow> {
  const name = args.input.name.trim()
  if (!name) throw createApiError(ErrCode.BAD_REQUEST, 'Nome é obrigatório.')

  // Todo projeto pessoal precisa estar ancorado numa área da vida.
  const category = args.input.category ?? 'general'
  if (category === 'personal' && !args.input.lifeArea) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Projetos pessoais precisam de uma área da vida.')
  }

  // Parent project, when provided, must belong to the same user.
  if (args.input.parentProjectId) {
    await assertOwnedProject(db, {
      userId: args.userId,
      projectId: args.input.parentProjectId,
    })
  }
  if (args.input.goalId) {
    await assertOwnedGoal(db, { userId: args.userId, goalId: args.input.goalId })
  }

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({
        ...(args.input.id ? { id: args.input.id } : {}),
        ownerUserId: args.userId,
        name,
        category,
        parentProjectId: args.input.parentProjectId ?? null,
        goalId: args.input.goalId ?? null,
        companyId: args.input.companyId ?? null,
        lifeArea: args.input.lifeArea ?? null,
        notes: args.input.notes ?? '',
        subjectLabel: args.input.subjectLabel ?? '',
        subjectValue: args.input.subjectValue ?? '',
      })
      // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
      .onConflictDoNothing({ target: projects.id })
      .returning()
    if (!row) {
      if (args.input.id) {
        const [existing] = await tx
          .select()
          .from(projects)
          .where(and(eq(projects.id, args.input.id), eq(projects.ownerUserId, args.userId)))
          .limit(1)
        if (existing) return existing
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar projeto.')
    }
    await writeAudit(tx, {
      entity: 'project',
      entityId: row.id,
      action: 'create',
      actorUserId: args.userId,
      changes: { create: { name: row.name, category: row.category } },
    })
    return row
  })
}

export type UpdateProjectPatch = {
  name?: string
  category?: ProjectCategory
  parentProjectId?: string | null
  goalId?: string | null
  companyId?: string | null
  notes?: string
  subjectLabel?: string
  subjectValue?: string
  lifeArea?: ProjectRow['lifeArea']
}

export async function updateProject(
  db: Db,
  args: { userId: string; projectId: string; patch: UpdateProjectPatch },
): Promise<ProjectRow> {
  const existing = await assertOwnedProject(db, args)

  // Projeto pessoal não pode ficar sem área da vida — vale ao virar pessoal e
  // ao limpar a área de um projeto já pessoal.
  const nextCategory =
    args.patch.category !== undefined ? args.patch.category : existing.category
  const nextLifeArea =
    args.patch.lifeArea !== undefined ? args.patch.lifeArea : existing.lifeArea
  if (nextCategory === 'personal' && !nextLifeArea) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Projetos pessoais precisam de uma área da vida.')
  }

  const patch: Record<string, unknown> = { ...args.patch }
  if (patch.name !== undefined) {
    const n = String(patch.name).trim()
    if (!n) throw createApiError(ErrCode.BAD_REQUEST, 'Nome não pode ser vazio.')
    patch.name = n
  }
  if (args.patch.parentProjectId) {
    if (args.patch.parentProjectId === args.projectId) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Projeto não pode ser pai de si mesmo.')
    }
    await assertOwnedProject(db, {
      userId: args.userId,
      projectId: args.patch.parentProjectId,
    })
  }
  if (args.patch.goalId) {
    await assertOwnedGoal(db, { userId: args.userId, goalId: args.patch.goalId })
  }
  if (Object.keys(patch).length === 0) {
    return await getProject(db, args)
  }
  patch.updatedAt = new Date()
  return await db.transaction((tx) =>
    auditedUpdate<ProjectRow>(tx, projects, args.projectId, args.userId, patch, {
      entity: 'project',
    }),
  )
}

export async function archiveProject(
  db: Db,
  args: { userId: string; projectId: string; archived: boolean },
): Promise<ProjectRow> {
  await assertOwnedProject(db, args)
  return await db.transaction((tx) =>
    auditedUpdate<ProjectRow>(
      tx,
      projects,
      args.projectId,
      args.userId,
      { archived: args.archived, updatedAt: new Date() },
      { entity: 'project' },
    ),
  )
}

export async function deleteProject(
  db: Db,
  args: { userId: string; projectId: string },
): Promise<void> {
  await assertOwnedProject(db, args)
  await db.transaction((tx) =>
    auditedDelete<ProjectRow>(tx, projects, args.projectId, args.userId, {
      entity: 'project',
    }),
  )
}

/**
 * Counts active tasks linked to each project for the given user's owned
 * projects. Returned as a map of projectId → count. Projects with zero tasks
 * are omitted; the caller fills zeros when merging with listProjects results.
 */
export async function countTasksByProject(
  db: Db,
  args: { userId: string },
): Promise<Record<string, number>> {
  const rows = await db
    .select({ projectId: tasks.projectId, id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerUserId, args.userId),
        eq(tasks.archived, false),
        eq(tasks.done, false),
      ),
    )
  const counts: Record<string, number> = {}
  for (const r of rows) {
    if (!r.projectId) continue
    counts[r.projectId] = (counts[r.projectId] ?? 0) + 1
  }
  return counts
}

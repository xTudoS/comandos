import { and, desc, eq, inArray } from 'drizzle-orm'
import { goals, projects, tasks } from '~~/server/db/schema'
import { auditedUpdate, writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type GoalRow = typeof goals.$inferSelect

async function assertOwnedGoal(
  db: Db,
  args: { userId: string; goalId: string },
): Promise<GoalRow> {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, args.goalId), eq(goals.ownerUserId, args.userId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Meta não encontrada.')
  return row
}

export async function listGoals(
  db: Db,
  args: { userId: string; includeArchived?: boolean },
): Promise<GoalRow[]> {
  const filter = args.includeArchived
    ? eq(goals.ownerUserId, args.userId)
    : and(eq(goals.ownerUserId, args.userId), eq(goals.archived, false))
  return await db.select().from(goals).where(filter).orderBy(desc(goals.createdAt))
}

export async function getGoal(
  db: Db,
  args: { userId: string; goalId: string },
): Promise<GoalRow> {
  return await assertOwnedGoal(db, args)
}

export type CreateGoalInput = {
  // Id gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale" após o sync. Ver server/api/goals/index.post.ts.
  id?: string
  title: string
  description?: string
  category?: 'company' | 'product' | 'general' | 'personal'
  dueDate?: string | null
  companyId?: string | null
  lifeArea?: GoalRow['lifeArea']
}

export async function createGoal(
  db: Db,
  args: { userId: string; input: CreateGoalInput },
): Promise<GoalRow> {
  const title = args.input.title.trim()
  if (!title) throw createApiError(ErrCode.BAD_REQUEST, 'Título é obrigatório.')

  // Toda meta pessoal precisa estar ancorada numa área da vida.
  const category = args.input.category ?? 'general'
  if (category === 'personal' && !args.input.lifeArea) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Metas pessoais precisam de uma área da vida.')
  }

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(goals)
      .values({
        ...(args.input.id ? { id: args.input.id } : {}),
        ownerUserId: args.userId,
        title,
        description: args.input.description ?? '',
        category,
        dueDate: args.input.dueDate ?? null,
        companyId: args.input.companyId ?? null,
        lifeArea: args.input.lifeArea ?? null,
      })
      // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
      .onConflictDoNothing({ target: goals.id })
      .returning()
    if (!row) {
      if (args.input.id) {
        const [existing] = await tx
          .select()
          .from(goals)
          .where(and(eq(goals.id, args.input.id), eq(goals.ownerUserId, args.userId)))
          .limit(1)
        if (existing) return existing
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar meta.')
    }
    await writeAudit(tx, {
      entity: 'goal',
      entityId: row.id,
      action: 'create',
      actorUserId: args.userId,
      changes: { create: { title: row.title, dueDate: row.dueDate } },
    })
    return row
  })
}

export type UpdateGoalPatch = {
  title?: string
  description?: string
  category?: 'company' | 'product' | 'general' | 'personal'
  dueDate?: string | null
  companyId?: string | null
  lifeArea?: GoalRow['lifeArea']
}

export async function updateGoal(
  db: Db,
  args: { userId: string; goalId: string; patch: UpdateGoalPatch },
): Promise<GoalRow> {
  const existing = await assertOwnedGoal(db, args)

  // Meta pessoal não pode ficar sem área da vida — vale tanto ao trocar a
  // categoria para pessoal quanto ao limpar a área de uma meta já pessoal.
  const nextCategory =
    args.patch.category !== undefined ? args.patch.category : existing.category
  const nextLifeArea =
    args.patch.lifeArea !== undefined ? args.patch.lifeArea : existing.lifeArea
  if (nextCategory === 'personal' && !nextLifeArea) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Metas pessoais precisam de uma área da vida.')
  }

  const patch: Record<string, unknown> = { ...args.patch }
  if (patch.title !== undefined) {
    const t = String(patch.title).trim()
    if (!t) throw createApiError(ErrCode.BAD_REQUEST, 'Título não pode ser vazio.')
    patch.title = t
  }
  if (Object.keys(patch).length === 0) {
    return await getGoal(db, args)
  }
  patch.updatedAt = new Date()
  return await db.transaction((tx) =>
    auditedUpdate<GoalRow>(tx, goals, args.goalId, args.userId, patch, {
      entity: 'goal',
    }),
  )
}

export type GoalCascade = {
  /** Projetos para arquivar/apagar junto com a meta. */
  projectIds?: string[]
  /** Tarefas diretas para arquivar/apagar junto com a meta. */
  taskIds?: string[]
}

/** Children listing — used by the UI to populate the cascade-selection modal. */
export type GoalChildren = {
  projects: Array<{ id: string; name: string; archived: boolean }>
  tasks: Array<{ id: string; title: string; archived: boolean; done: boolean }>
}

export async function listGoalChildren(
  db: Db,
  args: { userId: string; goalId: string },
): Promise<GoalChildren> {
  await assertOwnedGoal(db, args)
  const linkedProjects = await db
    .select({ id: projects.id, name: projects.name, archived: projects.archived })
    .from(projects)
    .where(
      and(
        eq(projects.ownerUserId, args.userId),
        eq(projects.goalId, args.goalId),
      ),
    )
  const linkedTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      archived: tasks.archived,
      done: tasks.done,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerUserId, args.userId),
        eq(tasks.goalId, args.goalId),
      ),
    )
  return { projects: linkedProjects, tasks: linkedTasks }
}

export async function archiveGoal(
  db: Db,
  args: {
    userId: string
    goalId: string
    archived: boolean
    cascade?: GoalCascade
  },
): Promise<GoalRow> {
  await assertOwnedGoal(db, args)
  const cascade = args.cascade ?? {}
  const cascadeProjects = new Set(cascade.projectIds ?? [])
  const cascadeTasks = new Set(cascade.taskIds ?? [])

  return await db.transaction(async (tx) => {
    // 1. Descobre todos os filhos atualmente vinculados.
    const linkedProjects = await tx
      .select({ id: projects.id, archived: projects.archived })
      .from(projects)
      .where(
        and(eq(projects.ownerUserId, args.userId), eq(projects.goalId, args.goalId)),
      )
    const linkedTasks = await tx
      .select({ id: tasks.id, archived: tasks.archived })
      .from(tasks)
      .where(and(eq(tasks.ownerUserId, args.userId), eq(tasks.goalId, args.goalId)))

    // 2. Para cada projeto: cascade arquiva, senão desvincula.
    for (const p of linkedProjects) {
      if (cascadeProjects.has(p.id)) {
        if (p.archived !== args.archived) {
          await auditedUpdate(
            tx,
            projects,
            p.id,
            args.userId,
            { archived: args.archived, goalId: null, updatedAt: new Date() },
            { entity: 'project' },
          )
        } else {
          await auditedUpdate(
            tx,
            projects,
            p.id,
            args.userId,
            { goalId: null, updatedAt: new Date() },
            { entity: 'project' },
          )
        }
      } else {
        await auditedUpdate(
          tx,
          projects,
          p.id,
          args.userId,
          { goalId: null, updatedAt: new Date() },
          { entity: 'project' },
        )
      }
    }

    // 3. Tarefas: cascade arquiva, senão desvincula.
    for (const t of linkedTasks) {
      if (cascadeTasks.has(t.id)) {
        if (t.archived !== args.archived) {
          await auditedUpdate(
            tx,
            tasks,
            t.id,
            args.userId,
            { archived: args.archived, goalId: null, updatedAt: new Date() },
            { entity: 'task' },
          )
        } else {
          await auditedUpdate(
            tx,
            tasks,
            t.id,
            args.userId,
            { goalId: null, updatedAt: new Date() },
            { entity: 'task' },
          )
        }
      } else {
        await auditedUpdate(
          tx,
          tasks,
          t.id,
          args.userId,
          { goalId: null, updatedAt: new Date() },
          { entity: 'task' },
        )
      }
    }

    // 4. Arquiva a meta.
    return await auditedUpdate<GoalRow>(
      tx,
      goals,
      args.goalId,
      args.userId,
      { archived: args.archived, updatedAt: new Date() },
      { entity: 'goal' },
    )
  })
}

/**
 * Aggregated counts per goal for the user's owned goals.
 *
 * Spec §7.14 / §10.4 progressoMeta — m-stats-line:
 *   "5/12 ações concluídas · 3/8 tarefas diretas · 2/4 projetos"
 *
 * - tarefasDiretas: tasks with `goalId = goal.id` directly.
 * - projetos: projects with `goalId = goal.id`. Done = all tasks done & has tasks.
 * - acoes (totalT/totalP): direct tasks + tasks of linked projects, with
 *   feitas = subset done. The UI computes pct from these.
 *
 * The service returns raw counters; the client formats stats lines and pct.
 */
export type GoalAggregate = {
  goalId: string
  directTaskTotal: number
  directTaskDone: number
  projectsTotal: number
  projectsDone: number
  projectTaskTotal: number
  projectTaskDone: number
  projectIds: string[]
}

export async function aggregateGoalProgress(
  db: Db,
  args: { userId: string },
): Promise<Record<string, GoalAggregate>> {
  const ownedGoals = await db
    .select({ id: goals.id })
    .from(goals)
    .where(eq(goals.ownerUserId, args.userId))

  if (ownedGoals.length === 0) return {}
  const goalIds = ownedGoals.map((g) => g.id)

  const linkedProjects = await db
    .select({ id: projects.id, goalId: projects.goalId })
    .from(projects)
    .where(
      and(
        eq(projects.ownerUserId, args.userId),
        eq(projects.archived, false),
        inArray(projects.goalId, goalIds),
      ),
    )

  const directTasks = await db
    .select({ goalId: tasks.goalId, done: tasks.done })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerUserId, args.userId),
        eq(tasks.archived, false),
        inArray(tasks.goalId, goalIds),
      ),
    )

  const projectIdsAll = linkedProjects.map((p) => p.id)
  const projectTasks =
    projectIdsAll.length > 0
      ? await db
          .select({ projectId: tasks.projectId, done: tasks.done })
          .from(tasks)
          .where(
            and(
              eq(tasks.ownerUserId, args.userId),
              eq(tasks.archived, false),
              inArray(tasks.projectId, projectIdsAll),
            ),
          )
      : []

  // projectId → { goalId, total, done }
  const projectStats = new Map<string, { goalId: string; total: number; done: number }>()
  for (const p of linkedProjects) {
    if (!p.goalId) continue
    projectStats.set(p.id, { goalId: p.goalId, total: 0, done: 0 })
  }
  for (const t of projectTasks) {
    if (!t.projectId) continue
    const s = projectStats.get(t.projectId)
    if (!s) continue
    s.total += 1
    if (t.done) s.done += 1
  }

  const out: Record<string, GoalAggregate> = {}
  for (const id of goalIds) {
    out[id] = {
      goalId: id,
      directTaskTotal: 0,
      directTaskDone: 0,
      projectsTotal: 0,
      projectsDone: 0,
      projectTaskTotal: 0,
      projectTaskDone: 0,
      projectIds: [],
    }
  }
  for (const t of directTasks) {
    if (!t.goalId) continue
    const a = out[t.goalId]
    if (!a) continue
    a.directTaskTotal += 1
    if (t.done) a.directTaskDone += 1
  }
  for (const [pid, s] of projectStats) {
    const a = out[s.goalId]
    if (!a) continue
    a.projectIds.push(pid)
    a.projectsTotal += 1
    if (s.total > 0 && s.done === s.total) a.projectsDone += 1
    a.projectTaskTotal += s.total
    a.projectTaskDone += s.done
  }
  return out
}

import { and, desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { tasks, taskParticipants, people, projects, users, goals } from '~~/server/db/schema'
import { auditedDelete, auditedUpdate, writeAudit } from './audit'
import { canAccessTask, taskFilter } from './accessFilter'
import { assertPersonOwnedBy } from './peopleService'
import { boardAccessUserIdsForTask, boardsByTask, type TaskBoardRef } from './boardsService'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

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

async function assertGoalOwnedBy(
  db: Db,
  args: { goalId: string; ownerUserId: string },
): Promise<void> {
  const [row] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, args.goalId), eq(goals.ownerUserId, args.ownerUserId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.BAD_REQUEST, 'Meta não encontrada.')
}

export type TaskRow = typeof tasks.$inferSelect
export type TaskHorizon = TaskRow['horizon']
export type TaskType = TaskRow['type']

export type TaskParticipant = { personId: string; name: string }

/** Igual ao TaskParticipant, mais a conta vinculada — uso interno (access set do
 * broadcast). `linkedUserId` NÃO vai pro payload: ver toPublicParticipants. */
type ParticipantWithAccount = TaskParticipant & { linkedUserId: string | null }

export type TaskWithRelations = TaskRow & {
  delegatePersonName: string | null
  delegateLinkedUserId: string | null
  createdByName: string | null
  /** Nome do dono da tarefa — usado no card pra marcar tarefa que não é sua. */
  ownerName: string | null
  participants: TaskParticipant[]
  /** Quadros customizados em que a tarefa está — vira chip no card. */
  boards: TaskBoardRef[]
}

/** Alias pro segundo join em `users` (o primeiro é o criador). */
const ownerUsers = alias(users, 'owner_users')

/** Convidados de um conjunto de tarefas, agrupados por taskId (para enriquecer
 * as linhas sem N+1 queries). Traz também `linkedUserId` — quem tem conta
 * vinculada enxerga a tarefa (ver taskFilter) e precisa entrar no fan-out do
 * tempo real. */
async function participantsByTask(
  db: Db,
  taskIds: string[],
): Promise<Map<string, ParticipantWithAccount[]>> {
  const byTask = new Map<string, ParticipantWithAccount[]>()
  if (taskIds.length === 0) return byTask
  const rows = await db
    .select({
      taskId: taskParticipants.taskId,
      personId: taskParticipants.personId,
      name: people.name,
      linkedUserId: people.linkedUserId,
    })
    .from(taskParticipants)
    .innerJoin(people, eq(people.id, taskParticipants.personId))
    .where(inArray(taskParticipants.taskId, taskIds))
    .orderBy(people.name)
  for (const r of rows) {
    const arr = byTask.get(r.taskId) ?? []
    arr.push({ personId: r.personId, name: r.name, linkedUserId: r.linkedUserId })
    byTask.set(r.taskId, arr)
  }
  return byTask
}

/** Descarta o `linkedUserId` (id de conta de outro usuário não vai pro cliente). */
function toPublicParticipants(rows: ParticipantWithAccount[] | undefined): TaskParticipant[] {
  return (rows ?? []).map((p) => ({ personId: p.personId, name: p.name }))
}

/** Entrada de participante: ou uma pessoa existente (personId), ou uma nova a
 * criar (name/email) — mesma lógica do delegado. */
export type ParticipantInput = {
  personId?: string | null
  name?: string | null
  email?: string | null
}

/** Convidado recém-criado com email — candidato a receber convite automático. */
export type ParticipantInvite = {
  personId: string
  email: string
  name: string
  ownerUserId: string
}

/** Resolve a lista de participantes para ids de `people` (criando pessoas novas
 * quando vier só nome/email), garantindo que toda pessoa pertence ao dono.
 * Retorna também os convidados que têm email e ainda NÃO têm conta vinculada
 * (`invites`) — o chamador dispara o convite depois do commit. Sem conta
 * vinculada o convidado não enxerga a tarefa (ver taskFilter), então o convite é
 * o que fecha o ciclo tanto para pessoa nova quanto para contato já existente.
 * Não há risco de reenvio: prepareInvitation grava o linkedUserId no primeiro
 * envio e recusa pessoa já vinculada. */
async function resolveParticipantIds(
  db: Db,
  args: { ownerUserId: string; participants: ParticipantInput[] },
): Promise<{ ids: string[]; invites: ParticipantInvite[] }> {
  const ids: string[] = []
  const invites: ParticipantInvite[] = []
  const seen = new Set<string>()
  for (const p of args.participants) {
    if (p.personId) {
      const person = await assertPersonOwnedBy(db, {
        personId: p.personId,
        ownerUserId: args.ownerUserId,
        errMessage: 'Convidado não encontrado.',
      })
      if (!seen.has(p.personId)) {
        seen.add(p.personId)
        ids.push(p.personId)
        if (person.email && !person.linkedUserId) {
          invites.push({
            personId: person.id,
            email: person.email,
            name: person.name,
            ownerUserId: args.ownerUserId,
          })
        }
      }
      continue
    }
    const rawName = p.name?.trim()
    const rawEmail = p.email?.trim().toLowerCase() || null
    if (!rawName && !rawEmail) continue
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Email inválido.')
    }
    const name = rawName || rawEmail!.split('@')[0] || rawEmail!
    const [created] = await db
      .insert(people)
      .values({ ownerUserId: args.ownerUserId, name, email: rawEmail })
      .returning()
    if (!created) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar convidado.')
    if (!seen.has(created.id)) {
      seen.add(created.id)
      ids.push(created.id)
      // Convidado novo COM email → convite automático (opt-in do usuário).
      if (rawEmail) {
        invites.push({ personId: created.id, email: rawEmail, name, ownerUserId: args.ownerUserId })
      }
    }
  }
  return { ids, invites }
}

/** Substitui o conjunto de participantes de uma tarefa pelo informado. */
async function replaceTaskParticipants(
  db: Db,
  args: { taskId: string; personIds: string[] },
): Promise<void> {
  await db.delete(taskParticipants).where(eq(taskParticipants.taskId, args.taskId))
  if (args.personIds.length === 0) return
  await db
    .insert(taskParticipants)
    .values(args.personIds.map((personId) => ({ taskId: args.taskId, personId })))
    .onConflictDoNothing()
}

export async function listTasks(
  db: Db,
  args: { userId: string; includeArchived?: boolean },
): Promise<TaskWithRelations[]> {
  const filter = args.includeArchived
    ? taskFilter(args.userId)
    : and(taskFilter(args.userId), eq(tasks.archived, false))

  const rows = await db
    .select({
      task: tasks,
      delegateName: people.name,
      delegateLinkedUserId: people.linkedUserId,
      createdByName: users.name,
      ownerName: ownerUsers.name,
    })
    .from(tasks)
    .leftJoin(people, eq(people.id, tasks.delegatePersonId))
    .leftJoin(users, eq(users.id, tasks.createdByUserId))
    .leftJoin(ownerUsers, eq(ownerUsers.id, tasks.ownerUserId))
    .where(filter)
    .orderBy(desc(tasks.createdAt))

  const taskIds = rows.map((r) => r.task.id)
  const [byTask, boardsOf] = await Promise.all([
    participantsByTask(db, taskIds),
    boardsByTask(db, { userId: args.userId, taskIds }),
  ])
  return rows.map((r) => ({
    ...r.task,
    delegatePersonName: r.delegateName,
    delegateLinkedUserId: r.delegateLinkedUserId,
    createdByName: r.createdByName,
    ownerName: r.ownerName,
    participants: toPublicParticipants(byTask.get(r.task.id)),
    boards: boardsOf.get(r.task.id) ?? [],
  }))
}

/**
 * Para o tempo real (payload-push): busca a linha ENRIQUECIDA (mesmo shape do
 * listTasks) E o conjunto de acesso. `access` = dono + usuário vinculado ao
 * delegado + usuários vinculados aos convidados (espelho do taskFilter). Assim
 * o broadcast manda a tarefa pronta (sem o receptor refazer GET) e só para quem
 * tem acesso. Retorna null se a tarefa não existe (ex.: já deletada).
 */
export async function taskForBroadcast(
  db: Db,
  taskId: string,
): Promise<{ row: TaskWithRelations; access: string[] } | null> {
  const [r] = await db
    .select({
      task: tasks,
      delegateName: people.name,
      delegateLinkedUserId: people.linkedUserId,
      createdByName: users.name,
      ownerName: ownerUsers.name,
    })
    .from(tasks)
    .leftJoin(people, eq(people.id, tasks.delegatePersonId))
    .leftJoin(users, eq(users.id, tasks.createdByUserId))
    .leftJoin(ownerUsers, eq(ownerUsers.id, tasks.ownerUserId))
    .where(eq(tasks.id, taskId))
    .limit(1)
  if (!r) return null
  const byTask = await participantsByTask(db, [r.task.id])
  const participants = byTask.get(r.task.id) ?? []
  const row: TaskWithRelations = {
    ...r.task,
    delegatePersonName: r.delegateName,
    delegateLinkedUserId: r.delegateLinkedUserId,
    createdByName: r.createdByName,
    ownerName: r.ownerName,
    participants: toPublicParticipants(participants),
    // `boards` é POR USUÁRIO (cada destinatário enxerga um subconjunto dos
    // quadros), então não dá para resolver aqui, onde a linha é uma só para
    // todo o fan-out. Quem preenche é o realtimeBroadcast, por destinatário.
    boards: [],
  }
  const access = new Set<string>([r.task.ownerUserId])
  if (r.delegateLinkedUserId) access.add(r.delegateLinkedUserId)
  for (const p of participants) {
    if (p.linkedUserId) access.add(p.linkedUserId)
  }
  // Quem enxerga a tarefa por estar num quadro que a contém — quarto ramo do
  // taskFilter. Sem isso a edição não chegaria aos membros do quadro.
  for (const uid of await boardAccessUserIdsForTask(db, r.task.id)) access.add(uid)
  return { row, access: [...access] }
}

export async function getTask(
  db: Db,
  args: { userId: string; taskId: string },
): Promise<TaskRow> {
  if (!(await canAccessTask(db, args.userId, args.taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
  const [t] = await db.select().from(tasks).where(eq(tasks.id, args.taskId)).limit(1)
  if (!t) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  return t
}

export type CreateTaskInput = {
  // Id gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale" após o sync. Ver server/api/tasks/index.post.ts.
  id?: string
  title: string
  description?: string
  horizon?: TaskHorizon
  isMicro?: boolean
  type?: TaskType
  delegatePersonId?: string | null
  delegateName?: string | null
  delegateEmail?: string | null
  projectId?: string | null
  goalId?: string | null
  companyId?: string | null
  scheduledDate?: string | null
  scheduledTime?: string | null
  durationMinutes?: number | null
  followupActive?: boolean
  followupDate?: string | null
  followupHolderPersonId?: string | null
  followupDescription?: string | null
  lifeArea?: TaskRow['lifeArea']
  lifeItemId?: TaskRow['lifeItemId']
  participants?: ParticipantInput[]
}

async function resolveDelegateForCreate(
  db: Db,
  args: { userId: string; input: CreateTaskInput },
): Promise<string | null> {
  const type = args.input.type ?? 'ceo'
  if (type === 'ceo') return null

  if (type === 'personal') {
    if (args.input.delegatePersonId) {
      await assertPersonOwnedBy(db, {
        personId: args.input.delegatePersonId,
        ownerUserId: args.userId,
        errMessage: 'Assistente não encontrado.',
      })
      return args.input.delegatePersonId
    }
    return null
  }

  // type === 'delegate'
  if (args.input.delegatePersonId) {
    await assertPersonOwnedBy(db, {
      personId: args.input.delegatePersonId,
      ownerUserId: args.userId,
      errMessage: 'Pessoa não encontrada para delegar.',
    })
    return args.input.delegatePersonId
  }

  const rawName = args.input.delegateName?.trim()
  const rawEmail = args.input.delegateEmail?.trim().toLowerCase() || null
  if (!rawName && !rawEmail) {
    throw createApiError(
      ErrCode.BAD_REQUEST,
      'Tarefa delegate precisa de delegatePersonId, delegateName ou delegateEmail.',
    )
  }
  // When the user typed an email but no separate name, derive the display
  // name from the local-part so the person isn't saved as a raw email.
  const name = rawName || rawEmail!.split('@')[0] || rawEmail!
  if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Email inválido.')
  }
  const [created] = await db
    .insert(people)
    .values({ ownerUserId: args.userId, name, email: rawEmail })
    .returning()
  if (!created) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar pessoa.')
  return created.id
}

export async function createTask(
  db: Db,
  // `collectInvites`: coletor opcional preenchido com os convidados novos que têm
  // email — o endpoint dispara os convites depois do commit (fora da transação).
  args: { userId: string; input: CreateTaskInput; collectInvites?: ParticipantInvite[] },
): Promise<TaskRow> {
  const title = args.input.title.trim()
  if (!title) throw createApiError(ErrCode.BAD_REQUEST, 'Título é obrigatório.')

  const delegatePersonId = await resolveDelegateForCreate(db, args)
  const type = args.input.type ?? 'ceo'

  // Toda tarefa pessoal precisa estar ancorada numa área da vida.
  if (type === 'personal' && !args.input.lifeArea) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Tarefas pessoais precisam de uma área da vida.')
  }

  // Every person pointer on a task (delegate + followup holder) must belong
  // to the creating user's scope — FK onDelete:'set null' doesn't enforce
  // ownership on insert.
  if (args.input.followupHolderPersonId) {
    await assertPersonOwnedBy(db, {
      personId: args.input.followupHolderPersonId,
      ownerUserId: args.userId,
      errMessage: 'Pessoa do follow-up não encontrada.',
    })
  }
  if (args.input.projectId && args.input.goalId) {
    throw createApiError(
      ErrCode.BAD_REQUEST,
      'Tarefa não pode pertencer a projeto e meta ao mesmo tempo.',
    )
  }
  if (args.input.projectId) {
    await assertProjectOwnedBy(db, {
      projectId: args.input.projectId,
      ownerUserId: args.userId,
    })
  }
  if (args.input.goalId) {
    await assertGoalOwnedBy(db, {
      goalId: args.input.goalId,
      ownerUserId: args.userId,
    })
  }

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        ...(args.input.id ? { id: args.input.id } : {}),
        ownerUserId: args.userId,
        createdByUserId: args.userId,
        delegatePersonId,
        title,
        description: args.input.description ?? '',
        horizon: args.input.horizon ?? 'core30',
        isMicro: args.input.isMicro ?? false,
        type,
        projectId: args.input.projectId ?? null,
        goalId: args.input.goalId ?? null,
        scheduledDate: args.input.scheduledDate ?? null,
        scheduledTime: args.input.scheduledTime ?? null,
        durationMinutes: args.input.durationMinutes ?? null,
        followupActive: args.input.followupActive ?? false,
        followupDate: args.input.followupDate ?? null,
        followupHolderPersonId: args.input.followupHolderPersonId ?? null,
        followupDescription: args.input.followupDescription ?? null,
        companyId: args.input.companyId ?? null,
        lifeArea: args.input.lifeArea ?? null,
        lifeItemId: args.input.lifeItemId ?? null,
      })
      // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
      .onConflictDoNothing({ target: tasks.id })
      .returning()
    if (!row) {
      if (args.input.id) {
        const [existing] = await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, args.input.id), eq(tasks.ownerUserId, args.userId)))
          .limit(1)
        if (existing) return existing
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar tarefa.')
    }
    if (args.input.participants?.length) {
      const { ids: personIds, invites } = await resolveParticipantIds(tx, {
        ownerUserId: args.userId,
        participants: args.input.participants,
      })
      await replaceTaskParticipants(tx, { taskId: row.id, personIds })
      if (args.collectInvites) args.collectInvites.push(...invites)
    }
    await writeAudit(tx, {
      entity: 'task',
      entityId: row.id,
      action: 'create',
      actorUserId: args.userId,
      changes: { create: { title: row.title, type: row.type, horizon: row.horizon } },
    })
    return row
  })
}

export type UpdateTaskPatch = {
  title?: string
  description?: string
  horizon?: TaskHorizon
  isMicro?: boolean
  projectId?: string | null
  goalId?: string | null
  companyId?: string | null
  scheduledDate?: string | null
  scheduledTime?: string | null
  durationMinutes?: number | null
  followupActive?: boolean
  followupDate?: string | null
  followupHolderPersonId?: string | null
  followupDescription?: string | null
  lifeArea?: TaskRow['lifeArea']
  lifeItemId?: TaskRow['lifeItemId']
  /** Quando presente, substitui todo o conjunto de convidados da tarefa. */
  participants?: ParticipantInput[]
}

export async function updateTask(
  db: Db,
  // `collectInvites`: ver createTask — preenchido com convidados novos (com
  // email) para o endpoint convidar depois do commit.
  args: { userId: string; taskId: string; patch: UpdateTaskPatch; collectInvites?: ParticipantInvite[] },
): Promise<TaskRow> {
  if (!(await canAccessTask(db, args.userId, args.taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
  // `participants` não é coluna de tasks — separa do patch de colunas e resolve
  // depois (dentro da mesma transação).
  const participants = args.patch.participants
  const patch: Record<string, unknown> = { ...args.patch }
  delete patch.participants
  if (patch.title !== undefined) {
    const t = String(patch.title).trim()
    if (!t) throw createApiError(ErrCode.BAD_REQUEST, 'Título não pode ser vazio.')
    patch.title = t
  }
  // followupHolderPersonId, when set, must belong to the TASK OWNER's scope —
  // not the editing user's (a delegate editing the task can't pin a follow-
  // up to one of their own contacts). Clearing with null is always allowed.
  if (
    args.patch.followupHolderPersonId ||
    args.patch.projectId !== undefined ||
    args.patch.goalId !== undefined
  ) {
    const [row] = await db
      .select({
        ownerUserId: tasks.ownerUserId,
        projectId: tasks.projectId,
        goalId: tasks.goalId,
      })
      .from(tasks)
      .where(eq(tasks.id, args.taskId))
      .limit(1)
    if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
    if (args.patch.followupHolderPersonId) {
      await assertPersonOwnedBy(db, {
        personId: args.patch.followupHolderPersonId,
        ownerUserId: row.ownerUserId,
        errMessage: 'Pessoa do follow-up não encontrada.',
      })
    }
    if (args.patch.projectId) {
      await assertProjectOwnedBy(db, {
        projectId: args.patch.projectId,
        ownerUserId: row.ownerUserId,
      })
    }
    if (args.patch.goalId) {
      await assertGoalOwnedBy(db, {
        goalId: args.patch.goalId,
        ownerUserId: row.ownerUserId,
      })
    }
    // XOR: tarefa pertence a projeto OU meta, nunca aos dois.
    // - patch only sets project: clear goal automatically
    // - patch only sets goal: clear project automatically
    // - patch sets both non-null: reject
    const finalProject =
      args.patch.projectId !== undefined ? args.patch.projectId : row.projectId
    const finalGoal =
      args.patch.goalId !== undefined ? args.patch.goalId : row.goalId
    if (finalProject && finalGoal) {
      if (args.patch.projectId && args.patch.goalId) {
        throw createApiError(
          ErrCode.BAD_REQUEST,
          'Tarefa não pode pertencer a projeto e meta ao mesmo tempo.',
        )
      }
      if (args.patch.projectId !== undefined && args.patch.projectId !== null) {
        patch.goalId = null
      } else if (args.patch.goalId !== undefined && args.patch.goalId !== null) {
        patch.projectId = null
      }
    }
  }
  // Tarefa pessoal não pode ficar sem área da vida — barra o clear via patch.
  if (args.patch.lifeArea === null) {
    const [row] = await db
      .select({ type: tasks.type })
      .from(tasks)
      .where(eq(tasks.id, args.taskId))
      .limit(1)
    if (row?.type === 'personal') {
      throw createApiError(ErrCode.BAD_REQUEST, 'Tarefas pessoais precisam de uma área da vida.')
    }
  }
  // Nada a atualizar (nem colunas nem convidados) → devolve como está.
  if (participants === undefined && Object.keys(patch).length === 0) {
    return await getTask(db, args)
  }
  // Convidados pertencem ao ESCOPO DO DONO da tarefa (não de quem edita).
  let ownerForParticipants: string | null = null
  if (participants !== undefined) {
    const [ownerRow] = await db
      .select({ ownerUserId: tasks.ownerUserId })
      .from(tasks)
      .where(eq(tasks.id, args.taskId))
      .limit(1)
    if (!ownerRow) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
    ownerForParticipants = ownerRow.ownerUserId
  }
  // Sempre bumpa updatedAt para o realtime/reconcile propagar (inclusive quando
  // só os convidados mudaram).
  patch.updatedAt = new Date()
  return await db.transaction(async (tx) => {
    if (participants !== undefined && ownerForParticipants) {
      const { ids: personIds, invites } = await resolveParticipantIds(tx, {
        ownerUserId: ownerForParticipants,
        participants,
      })
      await replaceTaskParticipants(tx, { taskId: args.taskId, personIds })
      if (args.collectInvites) args.collectInvites.push(...invites)
    }
    return await auditedUpdate<TaskRow>(tx, tasks, args.taskId, args.userId, patch, {
      entity: 'task',
    })
  })
}

export async function completeTask(
  db: Db,
  args: { userId: string; taskId: string; done: boolean },
): Promise<TaskRow> {
  if (!(await canAccessTask(db, args.userId, args.taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
  // Idempotency guard: skip the write when the flag is already in the target
  // state. Without this, a repeated `done: true` call would refresh
  // completedAt to a fresh Date every time and emit a spurious 'update'
  // audit row on each call.
  const [current] = await db
    .select({ done: tasks.done })
    .from(tasks)
    .where(eq(tasks.id, args.taskId))
    .limit(1)
  if (current && current.done === args.done) {
    return await getTask(db, args)
  }
  return await db.transaction((tx) =>
    auditedUpdate<TaskRow>(
      tx,
      tasks,
      args.taskId,
      args.userId,
      {
        done: args.done,
        completedAt: args.done ? new Date() : null,
        updatedAt: new Date(),
      },
      { entity: 'task' },
    ),
  )
}

export async function archiveTask(
  db: Db,
  args: { userId: string; taskId: string; archived: boolean },
): Promise<TaskRow> {
  if (!(await canAccessTask(db, args.userId, args.taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
  return await db.transaction((tx) =>
    auditedUpdate<TaskRow>(
      tx,
      tasks,
      args.taskId,
      args.userId,
      { archived: args.archived, updatedAt: new Date() },
      { entity: 'task' },
    ),
  )
}

/**
 * Reassigns a task between types (ceo/delegate/personal). Creator-only — the
 * delegate cannot bounce the task to someone else (workflow guarantee).
 *
 * Transitions:
 * - To 'ceo': clears delegate (or keeps it dormant)
 * - To 'delegate': requires delegatePersonId, delegateName ou delegateEmail
 * - To 'personal': auto-resolve assistant person; errors if owner has no
 *   assistant configured
 *
 * If `targetType` is omitted, falls back to the legacy behavior:
 * delegatePersonId set → 'delegate', null → 'ceo'.
 */
export async function reassignTask(
  db: Db,
  args: {
    userId: string
    taskId: string
    targetType?: TaskType
    delegatePersonId: string | null
    delegateName?: string | null
    delegateEmail?: string | null
  },
): Promise<TaskRow> {
  const [current] = await db.select().from(tasks).where(eq(tasks.id, args.taskId)).limit(1)
  if (!current) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  if (current.createdByUserId !== args.userId) {
    throw createApiError(ErrCode.REASSIGN_FORBIDDEN, 'Apenas quem criou pode reatribuir.')
  }

  // Determine target type — explicit > implicit-from-delegate.
  let targetType: TaskType
  if (args.targetType) {
    targetType = args.targetType
  } else {
    targetType = args.delegatePersonId ? 'delegate' : 'ceo'
  }

  let newDelegateId: string | null = null

  if (targetType === 'personal') {
    if (args.delegatePersonId) {
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(
          and(
            eq(people.id, args.delegatePersonId),
            eq(people.ownerUserId, current.ownerUserId),
            eq(people.archived, false),
          ),
        )
        .limit(1)
      if (!person) {
        throw createApiError(ErrCode.BAD_REQUEST, 'Assistente não encontrado.')
      }
      newDelegateId = args.delegatePersonId
    } else {
      newDelegateId = null
    }
  } else if (targetType === 'delegate') {
    if (args.delegatePersonId) {
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(
          and(
            eq(people.id, args.delegatePersonId),
            eq(people.ownerUserId, current.ownerUserId),
            eq(people.archived, false),
          ),
        )
        .limit(1)
      if (!person) {
        throw createApiError(ErrCode.BAD_REQUEST, 'Pessoa não encontrada para delegar.')
      }
      newDelegateId = args.delegatePersonId
    } else if (args.delegateName || args.delegateEmail) {
      const trimmedName = args.delegateName?.trim() ?? ''
      const trimmedEmail = args.delegateEmail?.trim().toLowerCase() || null
      if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw createApiError(ErrCode.BAD_REQUEST, 'Email inválido.')
      }
      const name =
        trimmedName || (trimmedEmail ? trimmedEmail.split('@')[0] || trimmedEmail : '')
      if (!name) {
        throw createApiError(ErrCode.BAD_REQUEST, 'Nome da pessoa não pode ser vazio.')
      }
      const [created] = await db
        .insert(people)
        .values({ ownerUserId: current.ownerUserId, name, email: trimmedEmail })
        .returning()
      if (!created) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar pessoa.')
      newDelegateId = created.id
    } else {
      throw createApiError(
        ErrCode.BAD_REQUEST,
        'Tarefa delegada precisa de pessoa.',
      )
    }
  }
  // targetType === 'ceo' → newDelegateId stays null

  return await db.transaction((tx) =>
    auditedUpdate<TaskRow>(
      tx,
      tasks,
      args.taskId,
      args.userId,
      {
        delegatePersonId: newDelegateId,
        type: targetType,
        updatedAt: new Date(),
      },
      {
        entity: 'task',
        context: {
          from_type: current.type,
          to_type: targetType,
          from_delegate: current.delegatePersonId,
          to_delegate: newDelegateId,
        },
      },
    ),
  )
}

export async function deleteTask(
  db: Db,
  args: { userId: string; taskId: string },
): Promise<void> {
  if (!(await canAccessTask(db, args.userId, args.taskId))) {
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  }
  await db.transaction((tx) =>
    auditedDelete<TaskRow>(tx, tasks, args.taskId, args.userId, { entity: 'task' }),
  )
}

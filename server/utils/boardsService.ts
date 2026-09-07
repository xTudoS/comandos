import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { boards, boardCards, boardColumns, boardMembers, people } from '~~/server/db/schema'
import { createApiError, ErrCode } from './errors'
import { reorderColumns } from '~~/shared/boardOrder'
import type { Db } from './db'

export type BoardRow = typeof boards.$inferSelect
export type BoardColumnRow = typeof boardColumns.$inferSelect

/** Colunas criadas junto com todo quadro novo. */
const DEFAULT_COLUMNS = ['A fazer', 'Fazendo', 'Feito']

/**
 * Predicado "este usuário enxerga este quadro": dono, ou membro cuja pessoa tem
 * conta vinculada. É o espelho do quarto ramo do taskFilter — manter os dois
 * alinhados é o que garante que quem vê o quadro vê as tarefas dele.
 */
export function boardFilter(userId: string) {
  return or(
    eq(boards.ownerUserId, userId),
    sql`EXISTS (
      SELECT 1 FROM ${boardMembers}
      JOIN ${people} ON ${people.id} = ${boardMembers.personId}
      WHERE ${boardMembers.boardId} = ${boards.id}
        AND ${people.linkedUserId} = ${userId}
    )`,
  )
}

/**
 * Carrega o quadro se o usuário tem acesso. Devolve `null` quando não existe OU
 * quando o usuário não alcança — quem chama responde 404 nos dois casos, para
 * não revelar a existência de quadros alheios.
 */
export async function findAccessibleBoard(
  db: Db,
  args: { userId: string; boardId: string },
): Promise<{ board: BoardRow; isOwner: boolean } | null> {
  const [row] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, args.boardId), boardFilter(args.userId)!))
    .limit(1)
  if (!row) return null
  return { board: row, isOwner: row.ownerUserId === args.userId }
}

/** Igual ao findAccessibleBoard, mas estoura 404 em vez de devolver null. */
export async function assertBoardAccess(
  db: Db,
  args: { userId: string; boardId: string },
): Promise<{ board: BoardRow; isOwner: boolean }> {
  const found = await findAccessibleBoard(db, args)
  if (!found) throw createApiError(ErrCode.NOT_FOUND, 'Quadro não encontrado.')
  return found
}

/**
 * Ações reservadas ao dono: renomear, arquivar, apagar o quadro e gerenciar
 * membros. Membro mexe em colunas e cards à vontade.
 */
export async function assertBoardOwner(
  db: Db,
  args: { userId: string; boardId: string },
): Promise<BoardRow> {
  const { board, isOwner } = await assertBoardAccess(db, args)
  if (!isOwner) {
    throw createApiError(ErrCode.FORBIDDEN, 'Só o dono do quadro pode fazer isso.')
  }
  return board
}

/**
 * Usuários que enxergam o quadro — dono + membros com conta vinculada. Usado
 * pelo fan-out do tempo real.
 */
export async function boardAccessUserIds(db: Db, boardId: string): Promise<string[]> {
  const [board] = await db
    .select({ ownerUserId: boards.ownerUserId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1)
  if (!board) return []
  const rows = await db
    .select({ linkedUserId: people.linkedUserId })
    .from(boardMembers)
    .innerJoin(people, eq(people.id, boardMembers.personId))
    .where(eq(boardMembers.boardId, boardId))
  const access = new Set<string>([board.ownerUserId])
  for (const r of rows) {
    if (r.linkedUserId) access.add(r.linkedUserId)
  }
  return [...access]
}

/**
 * Usuários que enxergam uma TAREFA por causa de um quadro — dono do quadro e
 * membros com conta vinculada. Espelha o quarto ramo do taskFilter e entra no
 * fan-out do tempo real: sem isso a edição de uma tarefa compartilhada por
 * quadro não chegaria aos demais membros.
 */
export async function boardAccessUserIdsForTask(db: Db, taskId: string): Promise<string[]> {
  const owners = await db
    .select({ userId: boards.ownerUserId })
    .from(boardCards)
    .innerJoin(boards, eq(boards.id, boardCards.boardId))
    .where(eq(boardCards.taskId, taskId))

  const memberRows = await db
    .select({ userId: people.linkedUserId })
    .from(boardCards)
    .innerJoin(boardMembers, eq(boardMembers.boardId, boardCards.boardId))
    .innerJoin(people, eq(people.id, boardMembers.personId))
    .where(eq(boardCards.taskId, taskId))

  const access = new Set<string>()
  for (const r of owners) access.add(r.userId)
  for (const r of memberRows) {
    if (r.userId) access.add(r.userId)
  }
  return [...access]
}

/** Quadro como aparece no card da tarefa — só o necessário para o chip. */
export type TaskBoardRef = { id: string; name: string; color: string | null }

/**
 * Quadros de um conjunto de tarefas, agrupados por taskId (uma query só, sem
 * N+1). Restrito aos quadros que o usuário alcança e não arquivados: um chip
 * apontando para quadro alheio vazaria a existência dele, e um chip de quadro
 * arquivado é ruído — ele nem aparece na sidebar.
 */
export async function boardsByTask(
  db: Db,
  args: { userId: string; taskIds: string[] },
): Promise<Map<string, TaskBoardRef[]>> {
  const byTask = new Map<string, TaskBoardRef[]>()
  if (args.taskIds.length === 0) return byTask

  const rows = await db
    .select({
      taskId: boardCards.taskId,
      id: boards.id,
      name: boards.name,
      color: boards.color,
    })
    .from(boardCards)
    .innerJoin(boards, eq(boards.id, boardCards.boardId))
    .where(
      and(
        inArray(boardCards.taskId, args.taskIds),
        eq(boards.archived, false),
        boardFilter(args.userId)!,
      ),
    )
    .orderBy(asc(boards.position), asc(boards.name))

  for (const r of rows) {
    const arr = byTask.get(r.taskId) ?? []
    arr.push({ id: r.id, name: r.name, color: r.color })
    byTask.set(r.taskId, arr)
  }
  return byTask
}

export type BoardSummary = BoardRow & {
  isOwner: boolean
  /** > 0 marca o quadro como compartilhado na UI. */
  memberCount: number
  cardCount: number
}

export async function listBoards(
  db: Db,
  args: { userId: string; includeArchived?: boolean },
): Promise<BoardSummary[]> {
  const filter = args.includeArchived
    ? boardFilter(args.userId)
    : and(boardFilter(args.userId), eq(boards.archived, false))

  const rows = await db
    .select()
    .from(boards)
    .where(filter)
    .orderBy(asc(boards.position), asc(boards.createdAt))

  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  // Contagens em duas agregações, não em join com o select principal: join com
  // duas tabelas filhas multiplicaria as linhas e exigiria DISTINCT.
  const memberCounts = await db
    .select({ boardId: boardMembers.boardId, n: sql<number>`count(*)::int` })
    .from(boardMembers)
    .where(inArray(boardMembers.boardId, ids))
    .groupBy(boardMembers.boardId)
  const cardCounts = await db
    .select({ boardId: boardCards.boardId, n: sql<number>`count(*)::int` })
    .from(boardCards)
    .where(inArray(boardCards.boardId, ids))
    .groupBy(boardCards.boardId)

  const byMember = new Map(memberCounts.map((c) => [c.boardId, c.n]))
  const byCard = new Map(cardCounts.map((c) => [c.boardId, c.n]))

  return rows.map((r) => ({
    ...r,
    isOwner: r.ownerUserId === args.userId,
    memberCount: byMember.get(r.id) ?? 0,
    cardCount: byCard.get(r.id) ?? 0,
  }))
}

export type CreateBoardInput = {
  /** Id gerado no cliente (offline-first) — ver useTasks.create. */
  id?: string
  name: string
  icon?: string
  color?: string | null
}

export async function createBoard(
  db: Db,
  args: { userId: string; input: CreateBoardInput },
): Promise<{ board: BoardRow; columns: BoardColumnRow[] }> {
  const name = args.input.name.trim()
  if (!name) throw createApiError(ErrCode.BAD_REQUEST, 'Nome do quadro é obrigatório.')

  const [last] = await db
    .select({ max: sql<number | null>`max(${boards.position})` })
    .from(boards)
    .where(eq(boards.ownerUserId, args.userId))
  const position = (last?.max ?? -1) + 1

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(boards)
      .values({
        ...(args.input.id ? { id: args.input.id } : {}),
        ownerUserId: args.userId,
        name,
        icon: args.input.icon ?? 'columns-3',
        color: args.input.color ?? null,
        position,
      })
      // Id do cliente já existe = reenvio idempotente da fila offline.
      .onConflictDoNothing({ target: boards.id })
      .returning()

    if (!row) {
      if (args.input.id) {
        const [existing] = await tx
          .select()
          .from(boards)
          .where(and(eq(boards.id, args.input.id), eq(boards.ownerUserId, args.userId)))
          .limit(1)
        if (existing) {
          const cols = await tx
            .select()
            .from(boardColumns)
            .where(eq(boardColumns.boardId, existing.id))
            .orderBy(asc(boardColumns.position))
          return { board: existing, columns: cols }
        }
      }
      throw createApiError(ErrCode.INTERNAL, 'Falha ao criar quadro.')
    }

    const columns = await tx
      .insert(boardColumns)
      .values(DEFAULT_COLUMNS.map((colName, i) => ({ boardId: row.id, name: colName, position: i })))
      .returning()

    return { board: row, columns: columns.sort((a, b) => a.position - b.position) }
  })
}

export type UpdateBoardPatch = {
  name?: string
  icon?: string
  color?: string | null
  position?: number
  archived?: boolean
}

export async function updateBoard(
  db: Db,
  args: { userId: string; boardId: string; patch: UpdateBoardPatch },
): Promise<BoardRow> {
  await assertBoardOwner(db, { userId: args.userId, boardId: args.boardId })

  const values: Record<string, unknown> = { updatedAt: new Date() }
  if (args.patch.name !== undefined) {
    const name = args.patch.name.trim()
    if (!name) throw createApiError(ErrCode.BAD_REQUEST, 'Nome do quadro é obrigatório.')
    values.name = name
  }
  if (args.patch.icon !== undefined) values.icon = args.patch.icon
  if (args.patch.color !== undefined) values.color = args.patch.color
  if (args.patch.position !== undefined) values.position = args.patch.position
  if (args.patch.archived !== undefined) values.archived = args.patch.archived

  const [row] = await db
    .update(boards)
    .set(values)
    .where(eq(boards.id, args.boardId))
    .returning()
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Quadro não encontrado.')
  return row
}

export async function deleteBoard(
  db: Db,
  args: { userId: string; boardId: string },
): Promise<void> {
  await assertBoardOwner(db, { userId: args.userId, boardId: args.boardId })
  // Colunas, cards e membros somem por cascade. As TAREFAS não são tocadas —
  // apagar o quadro é desfazer uma visualização, não perder trabalho.
  await db.delete(boards).where(eq(boards.id, args.boardId))
}

// ─────────────────────────── Colunas ───────────────────────────

export async function listBoardColumns(db: Db, boardId: string): Promise<BoardColumnRow[]> {
  return await db
    .select()
    .from(boardColumns)
    .where(eq(boardColumns.boardId, boardId))
    .orderBy(asc(boardColumns.position), asc(boardColumns.createdAt))
}

export async function createBoardColumn(
  db: Db,
  args: { userId: string; boardId: string; input: { id?: string; name: string } },
): Promise<BoardColumnRow> {
  await assertBoardAccess(db, { userId: args.userId, boardId: args.boardId })
  const name = args.input.name.trim()
  if (!name) throw createApiError(ErrCode.BAD_REQUEST, 'Nome da coluna é obrigatório.')

  const [last] = await db
    .select({ max: sql<number | null>`max(${boardColumns.position})` })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, args.boardId))

  const [row] = await db
    .insert(boardColumns)
    .values({
      ...(args.input.id ? { id: args.input.id } : {}),
      boardId: args.boardId,
      name,
      position: (last?.max ?? -1) + 1,
    })
    .onConflictDoNothing({ target: boardColumns.id })
    .returning()

  if (!row) {
    if (args.input.id) {
      const [existing] = await db
        .select()
        .from(boardColumns)
        .where(
          and(eq(boardColumns.id, args.input.id), eq(boardColumns.boardId, args.boardId)),
        )
        .limit(1)
      if (existing) return existing
    }
    throw createApiError(ErrCode.INTERNAL, 'Falha ao criar coluna.')
  }
  return row
}

export async function updateBoardColumn(
  db: Db,
  args: { userId: string; boardId: string; columnId: string; name: string },
): Promise<BoardColumnRow> {
  await assertBoardAccess(db, { userId: args.userId, boardId: args.boardId })
  const name = args.name.trim()
  if (!name) throw createApiError(ErrCode.BAD_REQUEST, 'Nome da coluna é obrigatório.')

  const [row] = await db
    .update(boardColumns)
    .set({ name, updatedAt: new Date() })
    // boardId no WHERE: a rota é aninhada, então uma coluna de outro quadro
    // nunca é atingida mesmo se o id vier trocado.
    .where(and(eq(boardColumns.id, args.columnId), eq(boardColumns.boardId, args.boardId)))
    .returning()
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Coluna não encontrada.')
  return row
}

/**
 * Apaga a coluna movendo os cards para a primeira coluna restante. A última
 * coluna do quadro não pode ser apagada — um quadro sem colunas não teria onde
 * receber card.
 */
export async function deleteBoardColumn(
  db: Db,
  args: { userId: string; boardId: string; columnId: string },
): Promise<{ movedTo: string | null }> {
  await assertBoardAccess(db, { userId: args.userId, boardId: args.boardId })

  return await db.transaction(async (tx) => {
    const cols = await tx
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, args.boardId))
      .orderBy(asc(boardColumns.position), asc(boardColumns.createdAt))

    const target = cols.find((c) => c.id === args.columnId)
    // Reenvio da fila offline de um DELETE já aplicado: não é erro.
    if (!target) return { movedTo: null }
    if (cols.length <= 1) {
      throw createApiError(ErrCode.BAD_REQUEST, 'O quadro precisa de pelo menos uma coluna.')
    }

    const fallback = cols.find((c) => c.id !== args.columnId)!
    const moving = await tx
      .select({ taskId: boardCards.taskId })
      .from(boardCards)
      .where(eq(boardCards.columnId, args.columnId))
      .orderBy(asc(boardCards.position))

    if (moving.length) {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${boardCards.position})` })
        .from(boardCards)
        .where(eq(boardCards.columnId, fallback.id))
      let next = (last?.max ?? -1) + 1
      for (const card of moving) {
        await tx
          .update(boardCards)
          .set({ columnId: fallback.id, position: next++ })
          .where(
            and(eq(boardCards.boardId, args.boardId), eq(boardCards.taskId, card.taskId)),
          )
      }
    }

    await tx
      .delete(boardColumns)
      .where(and(eq(boardColumns.id, args.columnId), eq(boardColumns.boardId, args.boardId)))

    return { movedTo: fallback.id }
  })
}

export async function reorderBoardColumns(
  db: Db,
  args: { userId: string; boardId: string; columnIds: string[] },
): Promise<BoardColumnRow[]> {
  await assertBoardAccess(db, { userId: args.userId, boardId: args.boardId })

  return await db.transaction(async (tx) => {
    const cols = await tx
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, args.boardId))
      .orderBy(asc(boardColumns.position), asc(boardColumns.createdAt))

    const ordered = reorderColumns(cols.map((c) => c.id), args.columnIds)
    const byId = new Map(cols.map((c) => [c.id, c]))

    for (const [position, id] of ordered.entries()) {
      if (byId.get(id)?.position === position) continue
      await tx
        .update(boardColumns)
        .set({ position, updatedAt: new Date() })
        .where(eq(boardColumns.id, id))
    }

    return ordered.map((id, position) => ({ ...byId.get(id)!, position }))
  })
}

import { and, asc, eq, sql } from 'drizzle-orm'
import { boardCards, boardColumns, boards } from '~~/server/db/schema'
import { canAccessTask } from './accessFilter'
import { assertBoardAccess, boardFilter } from './boardsService'
import { createApiError, ErrCode } from './errors'
import { placeCard, reindexDelta, removeCard as removeFromOrder } from '~~/shared/boardOrder'
import { createTask, type CreateTaskInput, type ParticipantInvite, type TaskRow } from './tasksService'
import type { Db } from './db'

export type BoardCardRow = typeof boardCards.$inferSelect

/** O que o cliente precisa de um card — a tarefa em si vem da lista global. */
export type PublicCard = {
  boardId: string
  taskId: string
  columnId: string
  position: number
}

function toPublic(row: BoardCardRow): PublicCard {
  return {
    boardId: row.boardId,
    taskId: row.taskId,
    columnId: row.columnId,
    position: row.position,
  }
}

export async function listBoardCards(db: Db, boardId: string): Promise<PublicCard[]> {
  const rows = await db
    .select()
    .from(boardCards)
    .where(eq(boardCards.boardId, boardId))
    .orderBy(asc(boardCards.columnId), asc(boardCards.position))
  return rows.map(toPublic)
}

/** Confere que a coluna existe e pertence ao quadro. */
async function assertColumnInBoard(db: Db, boardId: string, columnId: string): Promise<void> {
  const [col] = await db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(and(eq(boardColumns.id, columnId), eq(boardColumns.boardId, boardId)))
    .limit(1)
  if (!col) throw createApiError(ErrCode.BAD_REQUEST, 'Coluna não pertence a este quadro.')
}

async function firstColumnId(db: Db, boardId: string): Promise<string> {
  const [col] = await db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, boardId))
    .orderBy(asc(boardColumns.position), asc(boardColumns.createdAt))
    .limit(1)
  if (!col) throw createApiError(ErrCode.BAD_REQUEST, 'Quadro sem colunas.')
  return col.id
}

async function columnOrder(db: Db, columnId: string) {
  const rows = await db
    .select({ taskId: boardCards.taskId, position: boardCards.position })
    .from(boardCards)
    .where(eq(boardCards.columnId, columnId))
    .orderBy(asc(boardCards.position))
  return rows
}

/** Cards de um conjunto de colunas, já normalizados — é o que a resposta devolve. */
async function cardsOfColumns(db: Db, boardId: string, columnIds: string[]): Promise<PublicCard[]> {
  const unique = [...new Set(columnIds)]
  const out: PublicCard[] = []
  for (const columnId of unique) {
    const rows = await db
      .select()
      .from(boardCards)
      .where(and(eq(boardCards.boardId, boardId), eq(boardCards.columnId, columnId)))
      .orderBy(asc(boardCards.position))
    out.push(...rows.map(toPublic))
  }
  return out
}

/**
 * Núcleo compartilhado por `addCard` e `moveCard`: coloca um card já existente
 * na coluna/índice pedidos e reescreve as posições das colunas afetadas.
 * Presume transação e acesso já verificados.
 */
async function placeCardTx(
  tx: Db,
  args: { boardId: string; taskId: string; fromColumnId: string; toColumnId: string; toIndex: number },
): Promise<string[]> {
  const { boardId, taskId, fromColumnId, toColumnId, toIndex } = args
  const sameColumn = fromColumnId === toColumnId

  const targetBefore = await columnOrder(tx, toColumnId)
  const nextTarget = placeCard(targetBefore.map((c) => c.taskId), taskId, toIndex)

  if (!sameColumn) {
    const sourceBefore = await columnOrder(tx, fromColumnId)
    const nextSource = removeFromOrder(sourceBefore.map((c) => c.taskId), taskId)
    await tx
      .update(boardCards)
      .set({ columnId: toColumnId })
      .where(and(eq(boardCards.boardId, boardId), eq(boardCards.taskId, taskId)))
    for (const c of reindexDelta(sourceBefore, nextSource)) {
      await tx
        .update(boardCards)
        .set({ position: c.position })
        .where(and(eq(boardCards.boardId, boardId), eq(boardCards.taskId, c.taskId)))
    }
  }

  // O card recém-movido pode não estar em targetBefore (veio de outra coluna),
  // então o delta é calculado contra a coluna de destino somada a ele.
  const targetBaseline = sameColumn
    ? targetBefore
    : [...targetBefore, { taskId, position: -1 }]
  for (const c of reindexDelta(targetBaseline, nextTarget)) {
    await tx
      .update(boardCards)
      .set({ position: c.position })
      .where(and(eq(boardCards.boardId, boardId), eq(boardCards.taskId, c.taskId)))
  }

  return sameColumn ? [toColumnId] : [fromColumnId, toColumnId]
}

export type AddCardInput = {
  /** Tarefa que já existe. Exclusivo com `task`. */
  taskId?: string
  /** Tarefa nova, criada junto com o card na mesma transação. */
  task?: CreateTaskInput
  columnId?: string
  toIndex?: number
}

export async function addCard(
  db: Db,
  args: {
    userId: string
    boardId: string
    input: AddCardInput
    collectInvites?: ParticipantInvite[]
  },
): Promise<{ cards: PublicCard[]; task: TaskRow | null }> {
  await assertBoardAccess(db, { userId: args.userId, boardId: args.boardId })

  if (!args.input.taskId && !args.input.task) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Informe uma tarefa existente ou uma tarefa nova.')
  }
  if (args.input.taskId && args.input.task) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Informe apenas uma tarefa.')
  }

  const columnId = args.input.columnId ?? (await firstColumnId(db, args.boardId))
  await assertColumnInBoard(db, args.boardId, columnId)

  return await db.transaction(async (tx) => {
    let createdTask: TaskRow | null = null
    let taskId: string

    if (args.input.task) {
      // createTask já é idempotente por id do cliente (ON CONFLICT DO NOTHING
      // + re-select), então o reenvio da fila offline não cria uma segunda tarefa.
      createdTask = await createTask(tx, {
        userId: args.userId,
        input: args.input.task,
        collectInvites: args.collectInvites,
      })
      taskId = createdTask.id
    } else {
      taskId = args.input.taskId!
      if (!(await canAccessTask(tx, args.userId, taskId))) {
        throw createApiError(ErrCode.FORBIDDEN, 'Você não tem acesso a esta tarefa.')
      }
    }

    const [existing] = await tx
      .select()
      .from(boardCards)
      .where(and(eq(boardCards.boardId, args.boardId), eq(boardCards.taskId, taskId)))
      .limit(1)

    if (!existing) {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${boardCards.position})` })
        .from(boardCards)
        .where(eq(boardCards.columnId, columnId))
      await tx.insert(boardCards).values({
        boardId: args.boardId,
        taskId,
        columnId,
        position: (last?.max ?? -1) + 1,
        addedByUserId: args.userId,
      })
    }

    const fromColumnId = existing?.columnId ?? columnId

    // Card que já estava nesta mesma coluna e sem índice pedido: deixa onde
    // está. É o caso de remarcar um quadro já marcado no TaskModal (e do
    // reenvio da fila offline) — nenhum dos dois deve reordenar nada.
    if (existing && fromColumnId === columnId && args.input.toIndex == null) {
      return { cards: await cardsOfColumns(tx, args.boardId, [columnId]), task: createdTask }
    }

    const toIndex = args.input.toIndex ?? (await columnOrder(tx, columnId)).length
    const affected = await placeCardTx(tx, {
      boardId: args.boardId,
      taskId,
      fromColumnId,
      toColumnId: columnId,
      toIndex,
    })

    return { cards: await cardsOfColumns(tx, args.boardId, affected), task: createdTask }
  })
}

export async function moveCard(
  db: Db,
  args: {
    userId: string
    boardId: string
    taskId: string
    columnId: string
    toIndex: number
  },
): Promise<PublicCard[]> {
  await assertBoardAccess(db, { userId: args.userId, boardId: args.boardId })
  await assertColumnInBoard(db, args.boardId, args.columnId)

  return await db.transaction(async (tx) => {
    const [card] = await tx
      .select()
      .from(boardCards)
      .where(and(eq(boardCards.boardId, args.boardId), eq(boardCards.taskId, args.taskId)))
      .limit(1)
    if (!card) throw createApiError(ErrCode.NOT_FOUND, 'Card não encontrado neste quadro.')

    const affected = await placeCardTx(tx, {
      boardId: args.boardId,
      taskId: args.taskId,
      fromColumnId: card.columnId,
      toColumnId: args.columnId,
      toIndex: args.toIndex,
    })

    return await cardsOfColumns(tx, args.boardId, affected)
  })
}

/**
 * Tira a tarefa do quadro. Num quadro compartilhado isso REVOGA o acesso dos
 * membros à tarefa (o card era o que dava acesso) — é a saída sempre disponível
 * para o dono de uma tarefa que não quer mais compartilhá-la.
 *
 * Card inexistente responde sem erro: reenvio da fila offline não pode estourar.
 */
export async function removeCard(
  db: Db,
  args: { userId: string; boardId: string; taskId: string },
): Promise<PublicCard[]> {
  await assertBoardAccess(db, { userId: args.userId, boardId: args.boardId })

  return await db.transaction(async (tx) => {
    const [card] = await tx
      .select()
      .from(boardCards)
      .where(and(eq(boardCards.boardId, args.boardId), eq(boardCards.taskId, args.taskId)))
      .limit(1)
    if (!card) return []

    await tx
      .delete(boardCards)
      .where(and(eq(boardCards.boardId, args.boardId), eq(boardCards.taskId, args.taskId)))

    const before = await columnOrder(tx, card.columnId)
    for (const c of reindexDelta(before, before.map((r) => r.taskId))) {
      await tx
        .update(boardCards)
        .set({ position: c.position })
        .where(and(eq(boardCards.boardId, args.boardId), eq(boardCards.taskId, c.taskId)))
    }

    return await cardsOfColumns(tx, args.boardId, [card.columnId])
  })
}

/**
 * Quadros em que uma tarefa está — usado pelo campo "Quadros" do TaskModal.
 * Restrito aos quadros que o usuário alcança: sem o `boardFilter` a resposta
 * revelaria que a tarefa está num quadro de outra pessoa.
 */
export async function boardIdsForTask(
  db: Db,
  args: { userId: string; taskId: string },
): Promise<string[]> {
  const rows = await db
    .select({ boardId: boardCards.boardId })
    .from(boardCards)
    .innerJoin(boards, eq(boards.id, boardCards.boardId))
    .where(and(eq(boardCards.taskId, args.taskId), boardFilter(args.userId)!))
  return rows.map((r) => r.boardId)
}

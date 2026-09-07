import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'
import { placeCard, removeCard as removeFromOrder } from '~~/shared/boardOrder'
import type { CreateTaskInput } from '~/composables/useTasks'

export type BoardColumn = {
  id: string
  boardId: string
  name: string
  position: number
}

/** Card magro: a tarefa em si vem da lista global de `useTasks`. */
export type BoardCard = {
  boardId: string
  taskId: string
  columnId: string
  position: number
}

export type BoardMember = {
  personId: string
  name: string
  email: string | null
  /** Sem conta vinculada o membro ainda não enxerga nada — falta aceitar o convite. */
  hasAccount: boolean
}

export type BoardDetail = {
  id: string
  name: string
  icon: string
  color: string | null
  archived: boolean
  isOwner: boolean
}

/**
 * Estado do quadro aberto. As mutações são otimistas e reconciliadas com a
 * resposta do servidor, que devolve as colunas afetadas já normalizadas — por
 * isso a ordem na tela nunca diverge da gravada.
 */
export function useBoard(boardId: string) {
  const board = useState<BoardDetail | null>(`board:${boardId}:board`, () => null)
  const columns = useState<BoardColumn[]>(`board:${boardId}:columns`, () => [])
  const cards = useState<BoardCard[]>(`board:${boardId}:cards`, () => [])
  const members = useState<BoardMember[]>(`board:${boardId}:members`, () => [])
  const loading = useState(`board:${boardId}:loading`, () => false)
  const error = useState<string | null>(`board:${boardId}:error`, () => null)

  const isShared = computed(() => members.value.length > 0)

  /** Cards de uma coluna, na ordem — a fonte da ordenação da tela. */
  function cardsOf(columnId: string): BoardCard[] {
    return cards.value
      .filter((c) => c.columnId === columnId)
      .sort((a, b) => a.position - b.position)
  }

  function orderOf(columnId: string): string[] {
    return cardsOf(columnId).map((c) => c.taskId)
  }

  async function refresh() {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{
        board: BoardDetail
        columns: BoardColumn[]
        cards: BoardCard[]
        members: BoardMember[]
      }>(`/api/boards/${boardId}`)
      if (await hasPendingForEntity('boards')) return
      board.value = res.board
      columns.value = [...res.columns].sort((a, b) => a.position - b.position)
      cards.value = res.cards
      members.value = res.members
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      error.value =
        status === 404
          ? 'Quadro não encontrado.'
          : ((e as { message?: string })?.message ?? 'Falha ao carregar o quadro.')
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Aplica as colunas normalizadas devolvidas pelo servidor. */
  function applyServerCards(rows: BoardCard[], affectedColumnIds: string[]) {
    const affected = new Set(affectedColumnIds)
    cards.value = [...cards.value.filter((c) => !affected.has(c.columnId)), ...rows]
  }

  /** Reescreve as posições de uma coluna a partir de uma ordem de taskIds. */
  function writeOrder(columnId: string, order: string[]) {
    const byTask = new Map(cards.value.map((c) => [c.taskId, c]))
    const rest = cards.value.filter((c) => c.columnId !== columnId && !order.includes(c.taskId))
    const rebuilt = order.map((taskId, position) => ({
      ...(byTask.get(taskId) ?? { boardId, taskId }),
      columnId,
      position,
    })) as BoardCard[]
    cards.value = [...rest, ...rebuilt]
  }

  // ─────────────────────────── Cards ───────────────────────────

  /**
   * Move um card. `toIndex` é o índice FINAL na coluna de destino — mesma
   * convenção do Sortable e do servidor (ver shared/boardOrder.ts).
   */
  async function moveCard(taskId: string, toColumnId: string, toIndex: number) {
    const card = cards.value.find((c) => c.taskId === taskId)
    if (!card) return
    const fromColumnId = card.columnId
    const snapshot = cards.value

    // Otimista com o MESMO cálculo do servidor — é o que garante que a tela
    // pinta exatamente o que vai ser gravado.
    const nextTarget = placeCard(orderOf(toColumnId), taskId, toIndex)
    if (fromColumnId !== toColumnId) {
      writeOrder(fromColumnId, removeFromOrder(orderOf(fromColumnId), taskId))
    }
    writeOrder(toColumnId, nextTarget)

    const body = { taskId, columnId: toColumnId, toIndex }
    try {
      const res = await $fetch<{ cards: BoardCard[] }>(`/api/boards/${boardId}/cards/move`, {
        method: 'POST',
        body,
      })
      applyServerCards(res.cards, [fromColumnId, toColumnId])
    } catch (e) {
      if (!isOfflineError(e)) {
        cards.value = snapshot
        throw e
      }
      await queueRequest(
        'boards',
        'UPDATE',
        'POST',
        `/api/boards/${boardId}/cards/move`,
        body,
      )
    }
  }

  /** Coloca no quadro uma tarefa que já existe. */
  async function addExistingTask(taskId: string, columnId?: string, toIndex?: number) {
    const targetColumn = columnId ?? columns.value[0]?.id
    if (!targetColumn) return
    const snapshot = cards.value

    if (!cards.value.some((c) => c.taskId === taskId)) {
      const order = placeCard(orderOf(targetColumn), taskId, toIndex ?? orderOf(targetColumn).length)
      writeOrder(targetColumn, order)
    }

    const body = { taskId, columnId: targetColumn, ...(toIndex != null ? { toIndex } : {}) }
    try {
      const res = await $fetch<{ cards: BoardCard[] }>(`/api/boards/${boardId}/cards`, {
        method: 'POST',
        body,
      })
      applyServerCards(res.cards, [targetColumn])
      // A tarefa ganhou um quadro: o chip do card em /trabalho vem da lista global.
      await useTasks().refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        cards.value = snapshot
        throw e
      }
      await queueRequest('boards', 'CREATE', 'POST', `/api/boards/${boardId}/cards`, body)
    }
  }

  /**
   * Cria uma tarefa já dentro da coluna. Uma requisição só: duas encadeadas
   * virariam duas entradas na fila offline, e a segunda referenciaria um id que
   * a primeira ainda não confirmou.
   */
  async function createTaskInColumn(input: CreateTaskInput, columnId: string) {
    const { list: taskList } = useTasks()
    const taskId = import.meta.client ? crypto.randomUUID() : `tmp-${Date.now()}`
    const task = { ...input, id: taskId }
    const snapshot = cards.value

    writeOrder(columnId, [...orderOf(columnId), taskId])

    const body = { task, columnId }
    try {
      const res = await $fetch<{ cards: BoardCard[]; task: Record<string, unknown> | null }>(
        `/api/boards/${boardId}/cards`,
        { method: 'POST', body },
      )
      applyServerCards(res.cards, [columnId])
      // A tarefa entra na lista global; o próximo refresh de /api/tasks a traz
      // enriquecida (nome do dono, delegado…), que o card usa para renderizar.
      await useTasks().refresh()
      return res.task
    } catch (e) {
      if (!isOfflineError(e)) {
        cards.value = snapshot
        throw e
      }
      // Offline: pinta a tarefa na lista global para o card ter o que mostrar.
      taskList.value = [
        buildOfflineTask(taskId, input),
        ...taskList.value,
      ]
      await queueRequest('boards', 'CREATE', 'POST', `/api/boards/${boardId}/cards`, body)
      return null
    }
  }

  async function removeCard(taskId: string) {
    const card = cards.value.find((c) => c.taskId === taskId)
    if (!card) return
    const snapshot = cards.value
    const columnId = card.columnId
    writeOrder(columnId, removeFromOrder(orderOf(columnId), taskId))

    try {
      const res = await $fetch<{ cards: BoardCard[] }>(
        `/api/boards/${boardId}/cards/${taskId}`,
        { method: 'DELETE' },
      )
      applyServerCards(res.cards, [columnId])
      // A tarefa perdeu um quadro: atualiza o chip na lista global.
      await useTasks().refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        cards.value = snapshot
        throw e
      }
      await queueRequest(
        'boards',
        'DELETE',
        'DELETE',
        `/api/boards/${boardId}/cards/${taskId}`,
      )
    }
  }

  // ─────────────────────────── Colunas ───────────────────────────

  async function addColumn(name: string) {
    const id = import.meta.client ? crypto.randomUUID() : `tmp-${Date.now()}`
    const position = columns.value.reduce((max, c) => Math.max(max, c.position), -1) + 1
    const optimistic: BoardColumn = { id, boardId, name, position }
    columns.value = [...columns.value, optimistic]
    const body = { id, name }
    try {
      const row = await $fetch<BoardColumn>(`/api/boards/${boardId}/columns`, {
        method: 'POST',
        body,
      })
      const i = columns.value.findIndex((c) => c.id === id)
      if (i >= 0) columns.value[i] = row
    } catch (e) {
      if (!isOfflineError(e)) {
        columns.value = columns.value.filter((c) => c.id !== id)
        throw e
      }
      await queueRequest('boards', 'CREATE', 'POST', `/api/boards/${boardId}/columns`, body)
    }
  }

  async function renameColumn(columnId: string, name: string) {
    const i = columns.value.findIndex((c) => c.id === columnId)
    const prev = i >= 0 ? columns.value[i]! : null
    if (i >= 0) columns.value[i] = { ...columns.value[i]!, name }
    const body = { name }
    try {
      await $fetch(`/api/boards/${boardId}/columns/${columnId}`, { method: 'PATCH', body })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (i >= 0 && prev) columns.value[i] = prev
        throw e
      }
      await queueRequest(
        'boards',
        'UPDATE',
        'PATCH',
        `/api/boards/${boardId}/columns/${columnId}`,
        body,
      )
    }
  }

  /**
   * Apaga a coluna. Os cards não somem: vão para a primeira coluna restante —
   * apagar uma coluna é reorganizar, não perder trabalho.
   */
  async function deleteColumn(columnId: string) {
    if (columns.value.length <= 1) {
      throw new Error('O quadro precisa de pelo menos uma coluna.')
    }
    const snapshotCols = columns.value
    const snapshotCards = cards.value
    const fallback = columns.value.find((c) => c.id !== columnId)!

    const moving = orderOf(columnId)
    columns.value = columns.value.filter((c) => c.id !== columnId)
    if (moving.length) writeOrder(fallback.id, [...orderOf(fallback.id), ...moving])
    cards.value = cards.value.filter((c) => c.columnId !== columnId)

    try {
      await $fetch(`/api/boards/${boardId}/columns/${columnId}`, { method: 'DELETE' })
    } catch (e) {
      if (!isOfflineError(e)) {
        columns.value = snapshotCols
        cards.value = snapshotCards
        throw e
      }
      await queueRequest(
        'boards',
        'DELETE',
        'DELETE',
        `/api/boards/${boardId}/columns/${columnId}`,
      )
    }
  }

  async function reorderBoardColumns(columnIds: string[]) {
    const snapshot = columns.value
    const byId = new Map(columns.value.map((c) => [c.id, c]))
    columns.value = columnIds
      .map((id, position) => {
        const c = byId.get(id)
        return c ? { ...c, position } : null
      })
      .filter((c): c is BoardColumn => c !== null)

    const body = { columnIds }
    try {
      const res = await $fetch<{ columns: BoardColumn[] }>(
        `/api/boards/${boardId}/columns/reorder`,
        { method: 'POST', body },
      )
      columns.value = [...res.columns].sort((a, b) => a.position - b.position)
    } catch (e) {
      if (!isOfflineError(e)) {
        columns.value = snapshot
        throw e
      }
      await queueRequest(
        'boards',
        'UPDATE',
        'POST',
        `/api/boards/${boardId}/columns/reorder`,
        body,
      )
    }
  }

  // ─────────────────────────── Membros ───────────────────────────

  async function addMember(input: { personId?: string; name?: string; email?: string }) {
    const res = await $fetch<{ members: BoardMember[] }>(`/api/boards/${boardId}/members`, {
      method: 'POST',
      body: input,
    })
    members.value = res.members
  }

  async function removeMember(personId: string) {
    const res = await $fetch<{ members: BoardMember[] }>(
      `/api/boards/${boardId}/members/${personId}`,
      { method: 'DELETE' },
    )
    members.value = res.members
  }

  return {
    board,
    columns,
    cards,
    members,
    loading,
    error,
    isShared,
    cardsOf,
    refresh,
    moveCard,
    addExistingTask,
    createTaskInColumn,
    removeCard,
    addColumn,
    renameColumn,
    deleteColumn,
    reorderBoardColumns,
    addMember,
    removeMember,
  }
}

/** Tarefa mínima para a lista global enquanto offline (o servidor substitui). */
function buildOfflineTask(id: string, input: CreateTaskInput) {
  const now = new Date().toISOString()
  return {
    id,
    ownerUserId: '',
    createdByUserId: '',
    delegatePersonId: null,
    title: input.title,
    description: input.description ?? '',
    horizon: input.horizon ?? 'core30',
    isMicro: input.isMicro ?? false,
    type: input.type ?? 'ceo',
    projectId: null,
    goalId: null,
    companyId: null,
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: null,
    followupActive: false,
    followupDate: null,
    followupHolderPersonId: null,
    followupDescription: null,
    done: false,
    completedAt: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    delegatePersonName: null,
    delegateLinkedUserId: null,
    createdByName: null,
    ownerName: null,
    lifeArea: null,
    lifeItemId: null,
    participants: [],
    boards: [],
  } as unknown as import('~/composables/useTasks').Task
}

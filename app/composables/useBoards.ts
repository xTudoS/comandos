import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

/**
 * Lista de quadros do usuário (dono e onde é membro). Alimenta o grupo
 * "Quadros" da sidebar e a página /quadros. O conteúdo de um quadro aberto
 * (colunas e cards) fica em `useBoard`.
 */
export type Board = {
  id: string
  ownerUserId: string
  name: string
  icon: string
  color: string | null
  position: number
  archived: boolean
  createdAt: string
  updatedAt: string
  isOwner: boolean
  /** > 0 marca o quadro como compartilhado. */
  memberCount: number
  cardCount: number
}

export type CreateBoardInput = {
  name: string
  icon?: string
  color?: string | null
}

export type UpdateBoardPatch = Partial<
  Pick<Board, 'name' | 'icon' | 'color' | 'position' | 'archived'>
>

export function useBoards() {
  const list = useState<Board[]>('boards:list', () => [])
  const loading = useState('boards:loading', () => false)
  const error = useState<string | null>('boards:error', () => null)

  const active = computed(() => list.value.filter((b) => !b.archived))
  const archived = computed(() => list.value.filter((b) => b.archived))

  function sortBoards(rows: Board[]) {
    return [...rows].sort(
      (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
    )
  }

  async function refresh(opts: { includeArchived?: boolean } = {}) {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived !== false) query.includeArchived = '1'
      const res = await $fetch<{ boards: Board[] }>('/api/boards', { query })
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('boards'))) list.value = sortBoards(res.boards)
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar quadros.'
    } finally {
      loading.value = false
    }
  }

  function buildOptimistic(id: string, input: CreateBoardInput): Board {
    const now = new Date().toISOString()
    const position = list.value.reduce((max, b) => Math.max(max, b.position), -1) + 1
    return {
      id,
      ownerUserId: '',
      name: input.name,
      icon: input.icon ?? 'columns-3',
      color: input.color ?? null,
      position,
      archived: false,
      createdAt: now,
      updatedAt: now,
      isOwner: true,
      memberCount: 0,
      cardCount: 0,
    }
  }

  async function create(input: CreateBoardInput): Promise<Board> {
    // Id gerado no cliente: vira a fonte da verdade, então o sync offline nunca
    // referencia um id que o servidor não conhece.
    const id = import.meta.client ? crypto.randomUUID() : `tmp-${Date.now()}`
    const body = { ...input, id }
    const optimistic = buildOptimistic(id, input)
    list.value = sortBoards([...list.value, optimistic])
    try {
      const res = await $fetch<{ board: Board }>('/api/boards', { method: 'POST', body })
      await reconcile(id, res.board)
      return res.board
    } catch (e) {
      if (!isOfflineError(e)) {
        list.value = list.value.filter((b) => b.id !== id)
        throw e
      }
      await queueRequest('boards', 'CREATE', 'POST', '/api/boards', body)
      return optimistic
    }
  }

  // MERGE (não replace): o POST devolve a linha crua da tabela, sem os campos
  // derivados (isOwner, memberCount, cardCount) que só o GET calcula.
  async function reconcile(id: string, row: Partial<Board>) {
    if (await hasPendingForEntity('boards')) return
    const i = list.value.findIndex((b) => b.id === id)
    if (i >= 0) list.value[i] = { ...list.value[i]!, ...row }
  }

  async function update(id: string, patch: UpdateBoardPatch): Promise<void> {
    const i = list.value.findIndex((b) => b.id === id)
    const prev = i >= 0 ? list.value[i]! : null
    if (i >= 0) list.value[i] = { ...list.value[i]!, ...patch }
    try {
      const row = await $fetch<Board>(`/api/boards/${id}`, { method: 'PATCH', body: patch })
      await reconcile(id, row)
    } catch (e) {
      if (!isOfflineError(e)) {
        if (i >= 0 && prev) list.value[i] = prev
        throw e
      }
      await queueRequest('boards', 'UPDATE', 'PATCH', `/api/boards/${id}`, patch)
    }
  }

  async function remove(id: string): Promise<void> {
    const prev = list.value.find((b) => b.id === id) ?? null
    list.value = list.value.filter((b) => b.id !== id)
    try {
      await $fetch(`/api/boards/${id}`, { method: 'DELETE' })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (prev) list.value = sortBoards([...list.value, prev])
        throw e
      }
      await queueRequest('boards', 'DELETE', 'DELETE', `/api/boards/${id}`)
    }
  }

  async function leave(id: string): Promise<void> {
    const prev = list.value.find((b) => b.id === id) ?? null
    list.value = list.value.filter((b) => b.id !== id)
    try {
      await $fetch(`/api/boards/${id}/leave`, { method: 'POST' })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (prev) list.value = sortBoards([...list.value, prev])
        throw e
      }
      await queueRequest('boards', 'UPDATE', 'POST', `/api/boards/${id}/leave`)
    }
  }

  /** Reordena os quadros na sidebar, persistindo a posição de cada um. */
  async function reorder(orderedIds: string[]): Promise<void> {
    const byId = new Map(list.value.map((b) => [b.id, b]))
    const next = orderedIds.map((id, position) => {
      const b = byId.get(id)
      return b ? { ...b, position } : null
    })
    const moved = next.filter((b): b is Board => b !== null)
    if (moved.length !== list.value.length) return
    const changed = moved.filter((b) => byId.get(b.id)!.position !== b.position)
    list.value = sortBoards(moved)
    await Promise.all(changed.map((b) => update(b.id, { position: b.position })))
  }

  // ── Tempo real ──
  async function applyRemote(row: Board) {
    if (await hasPendingForEntity('boards')) return
    const i = list.value.findIndex((b) => b.id === row.id)
    if (i >= 0) list.value[i] = { ...list.value[i]!, ...row }
    else list.value = sortBoards([...list.value, row])
  }

  async function removeRemote(id: string) {
    if (await hasPendingForEntity('boards')) return
    list.value = list.value.filter((b) => b.id !== id)
  }

  return {
    list,
    active,
    archived,
    loading,
    error,
    refresh,
    create,
    update,
    remove,
    leave,
    reorder,
    applyRemote,
    removeRemote,
  }
}

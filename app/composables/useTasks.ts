import type { HorizonDb, HorizonUI } from '~/utils/horizontes'
import type { LifeAreaKey } from '~/composables/useLifeTracker'
import { horizonUIToDb } from '~/utils/horizontes'
import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

export type TaskType = 'ceo' | 'delegate' | 'personal'

export type TaskParticipant = { personId: string; name: string }

/** Quadro customizado em que a tarefa está — vira chip no rodapé do card. */
export type TaskBoardRef = { id: string; name: string; color: string | null }

/** Entrada de convidado: pessoa existente (personId) ou nova a criar (name/email). */
export type ParticipantInput = {
  personId?: string | null
  name?: string | null
  email?: string | null
}

export type Task = {
  id: string
  ownerUserId: string
  createdByUserId: string
  delegatePersonId: string | null
  title: string
  description: string
  horizon: HorizonDb
  isMicro: boolean
  type: TaskType
  projectId: string | null
  goalId: string | null
  companyId: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number | null
  followupActive: boolean
  followupDate: string | null
  followupHolderPersonId: string | null
  followupDescription: string | null
  done: boolean
  completedAt: string | null
  archived: boolean
  createdAt: string
  updatedAt: string
  delegatePersonName: string | null
  delegateLinkedUserId: string | null
  createdByName: string | null
  /** Nome do dono — usado pra marcar no card as tarefas que não são suas. */
  ownerName: string | null
  lifeArea: LifeAreaKey | null
  lifeItemId: string | null
  participants: TaskParticipant[]
  boards: TaskBoardRef[]
}

export type CreateTaskInput = {
  title: string
  description?: string
  horizon?: HorizonDb
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
  lifeArea?: LifeAreaKey | null
  lifeItemId?: string | null
  /** Convidados na criação (pessoas existentes e/ou novas). */
  participants?: ParticipantInput[]
}

export type UpdateTaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'horizon'
    | 'isMicro'
    | 'projectId'
    | 'goalId'
    | 'companyId'
    | 'scheduledDate'
    | 'scheduledTime'
    | 'durationMinutes'
    | 'followupActive'
    | 'followupDate'
    | 'followupHolderPersonId'
    | 'followupDescription'
    | 'lifeArea'
    | 'lifeItemId'
  >
> & {
  /** Quando presente, substitui todo o conjunto de convidados da tarefa. */
  participants?: ParticipantInput[]
}

// Converte entradas de convidado (que podem ser pessoas novas sem id) em marcas
// de exibição {personId,name}. Pessoas novas ficam com personId '' até o próximo
// refresh/broadcast trazer o id real do servidor.
function toDisplayParticipants(input: ParticipantInput[]): TaskParticipant[] {
  return input
    .map((p) => ({ personId: p.personId ?? '', name: (p.name ?? p.email ?? '').trim() }))
    .filter((p) => p.personId || p.name)
}

export function useTasks() {
  const list = useState<Task[]>('tasks:list', () => [])
  const loading = useState('tasks:loading', () => false)
  const error = useState<string | null>('tasks:error', () => null)
  const sessionNewTaskIds = useState<Record<string, boolean>>('tasks:sessionNew', () => ({}))

  async function refresh() {
    // Offline: mantém a lista local (hidratada/otimista); não sobrescreve com
    // cache velho do servidor.
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ tasks: Task[] }>('/api/tasks')
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('tasks'))) list.value = res.tasks
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar tarefas.'
    } finally {
      loading.value = false
    }
  }

  // Monta uma tarefa otimista a partir do input de criação (para refletir na UI
  // imediatamente quando offline; o servidor substitui no próximo refresh).
  function buildOptimisticTask(input: CreateTaskInput, id?: string): Task {
    const now = new Date().toISOString()
    return {
      id: id ?? (import.meta.client ? crypto.randomUUID() : `tmp-${now}`),
      ownerUserId: '',
      createdByUserId: '',
      delegatePersonId: input.delegatePersonId ?? null,
      title: input.title,
      description: input.description ?? '',
      horizon: input.horizon ?? 'core30',
      isMicro: input.isMicro ?? false,
      type: input.type ?? 'ceo',
      projectId: input.projectId ?? null,
      goalId: input.goalId ?? null,
      companyId: input.companyId ?? null,
      scheduledDate: input.scheduledDate ?? null,
      scheduledTime: input.scheduledTime ?? null,
      durationMinutes: input.durationMinutes ?? null,
      followupActive: input.followupActive ?? false,
      followupDate: input.followupDate ?? null,
      followupHolderPersonId: input.followupHolderPersonId ?? null,
      followupDescription: input.followupDescription ?? null,
      done: false,
      completedAt: null,
      archived: false,
      createdAt: now,
      updatedAt: now,
      delegatePersonName: input.delegateName ?? null,
      delegateLinkedUserId: null,
      createdByName: null,
      ownerName: null,
      lifeArea: input.lifeArea ?? null,
      lifeItemId: input.lifeItemId ?? null,
      participants: input.participants ? toDisplayParticipants(input.participants) : [],
      // Tarefa nova não está em quadro nenhum; quando é criada DENTRO de um
      // quadro, o refresh seguinte traz o chip.
      boards: [],
    }
  }

  // Reconcilia UMA linha com a verdade do servidor (sem refetch da lista toda).
  // MERGE (não replace): POST/PATCH retornam a linha CRUA da tabela tasks, sem os
  // campos derivados de join (delegatePersonName, createdByName, delegateLinkedUserId, ownerName)
  // — esses só vêm no GET. Espalhar a linha crua por cima preserva esses campos do
  // estado local e atualiza só as colunas reais. Respeita o guard de pendências.
  async function reconcileRow(id: string, row: Task) {
    if (await hasPendingForEntity('tasks')) return
    const i = list.value.findIndex((t) => t.id === id)
    if (i >= 0) list.value[i] = { ...list.value[i]!, ...row }
  }

  // ── Tempo real (payload-push): aplica uma linha vinda do WebSocket ──
  // `row` é a tarefa ENRIQUECIDA (mesmo shape do GET), então pode substituir por
  // inteiro (sem merge). Não refaz GET. Respeita o guard de pendências offline.
  async function applyRemote(row: Task) {
    if (await hasPendingForEntity('tasks')) return
    // Arquivada não pertence à lista ativa: remove se estiver presente.
    if (row.archived) {
      list.value = list.value.filter((t) => t.id !== row.id)
      return
    }
    const i = list.value.findIndex((t) => t.id === row.id)
    if (i >= 0) list.value[i] = row
    else list.value = [row, ...list.value]
  }

  async function removeRemote(id: string) {
    if (await hasPendingForEntity('tasks')) return
    list.value = list.value.filter((t) => t.id !== id)
  }

  async function create(input: CreateTaskInput) {
    // Id gerado no cliente e enviado ao servidor: vira a fonte da verdade, então
    // não há id "stale" depois do sync (PATCH/complete offline não dão mais 404).
    const id = import.meta.client ? crypto.randomUUID() : `tmp-${Date.now()}`
    sessionNewTaskIds.value[id] = true
    const body = { ...input, id }
    // Otimista também online: pinta na hora, igual ao offline, e propaga em
    // segundo plano. Antes o online esperava POST + refresh() (2 round-trips).
    const optimistic = buildOptimisticTask(input, id)
    list.value = [optimistic, ...list.value]
    try {
      const row = await $fetch<Task>('/api/tasks', { method: 'POST', body })
      await reconcileRow(id, row)
      return row
    } catch (e) {
      if (!isOfflineError(e)) {
        // Erro real (ex.: validação): desfaz a inserção otimista e propaga.
        list.value = list.value.filter((t) => t.id !== id)
        throw e
      }
      // Offline: mantém a otimista e enfileira para sincronizar ao reconectar.
      await queueRequest('tasks', 'CREATE', 'POST', '/api/tasks', body)
      return optimistic
    }
  }

  async function update(id: string, patch: UpdateTaskPatch) {
    const idx = list.value.findIndex((t) => t.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) {
      // `participants` no patch é ParticipantInput[] (formato do servidor); para o
      // estado otimista converte para as marcas de exibição {personId,name}.
      const optimisticParticipants = patch.participants
        ? toDisplayParticipants(patch.participants)
        : list.value[idx]!.participants
      list.value[idx] = {
        ...list.value[idx]!,
        ...patch,
        participants: optimisticParticipants,
        updatedAt: new Date().toISOString(),
      }
    }
    try {
      const row = await $fetch<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: patch })
      await reconcileRow(id, row)
      return row
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('tasks', 'UPDATE', 'PATCH', `/api/tasks/${id}`, patch)
      return list.value[idx] as Task
    }
  }

  async function complete(id: string, done: boolean) {
    const idx = list.value.findIndex((t) => t.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) {
      list.value[idx] = {
        ...list.value[idx]!,
        done,
        completedAt: done ? new Date().toISOString() : null,
      }
    }
    try {
      // Estado otimista já reflete a ação; sem refetch da lista.
      await $fetch(`/api/tasks/${id}/complete`, { method: 'POST', body: { done } })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('tasks', 'UPDATE', 'POST', `/api/tasks/${id}/complete`, { done })
    }
  }

  async function archive(id: string, archived = true) {
    const idx = list.value.findIndex((t) => t.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, archived }
    try {
      await $fetch(`/api/tasks/${id}/archive`, { method: 'POST', body: { archived } })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = prev
        throw e
      }
      await queueRequest('tasks', 'UPDATE', 'POST', `/api/tasks/${id}/archive`, { archived })
    }
  }

  async function remove(id: string) {
    const idx = list.value.findIndex((t) => t.id === id)
    const prev = idx >= 0 ? list.value[idx]! : null
    if (idx >= 0) list.value = list.value.filter((t) => t.id !== id)
    try {
      await $fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    } catch (e) {
      if (!isOfflineError(e)) {
        if (prev) list.value = [prev, ...list.value]
        throw e
      }
      await queueRequest('tasks', 'DELETE', 'DELETE', `/api/tasks/${id}`)
    }
  }

  async function reassign(
    id: string,
    payload: {
      targetType?: TaskType
      delegatePersonId: string | null
      delegateName?: string
      delegateEmail?: string | null
    },
  ) {
    try {
      await $fetch(`/api/tasks/${id}/reassign`, { method: 'POST', body: payload })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) throw e
      await queueRequest('tasks', 'UPDATE', 'POST', `/api/tasks/${id}/reassign`, payload)
    }
  }

  async function moveHorizon(id: string, toHorizonUi: HorizonUI) {
    const horizon = horizonUIToDb[toHorizonUi]
    // Otimista: o card fica no destino. Antes, o `await refresh()` pós-PATCH lia a
    // lista do servidor (cache do Hyperdrive) e às vezes voltava com o horizonte
    // antigo → o card "pulava de volta". Agora reconcilia só a linha (merge) e o
    // refetch da lista some.
    const idx = list.value.findIndex((t) => t.id === id)
    const prev = idx >= 0 ? list.value[idx]!.horizon : null
    if (idx >= 0) list.value[idx] = { ...list.value[idx]!, horizon }
    try {
      const row = await $fetch<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: { horizon } })
      await reconcileRow(id, row)
    } catch (e) {
      if (!isOfflineError(e)) {
        if (idx >= 0 && prev) list.value[idx] = { ...list.value[idx]!, horizon: prev }
        throw e
      }
      // Offline: mantém o otimista e enfileira.
      await queueRequest('tasks', 'UPDATE', 'PATCH', `/api/tasks/${id}`, { horizon })
    }
  }

  return {
    list,
    loading,
    error,
    refresh,
    create,
    update,
    complete,
    archive,
    remove,
    reassign,
    moveHorizon,
    applyRemote,
    removeRemote,
    sessionNewTaskIds,
  }
}

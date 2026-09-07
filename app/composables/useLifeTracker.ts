/**
 * Life Tracker — "boas-vindas diário" + painel de equilíbrio de vida.
 *
 * Backend: Postgres via `/api/life` (itens + check-ins). Offline-first no mesmo
 * padrão de useTasks: atualização otimista local + fila de sync quando offline.
 * A média é autoritativa — calculada a partir dos itens persistidos (nota da
 * área = média(itens)×10; geral = média das áreas), igual ao servidor
 * (server/utils/lifeService.ts → computeAggregate).
 */
import { hasPendingForEntity, isOfflineError, queueRequest } from '~/lib/offlineQueue'

export type LifeAreaKey =
  | 'corpo'
  | 'mente'
  | 'relacionamentos'
  | 'recursos'
  | 'experiencias'

export type LifeItem = { id: string; name: string; value: number }

export type LifeArea = {
  key: LifeAreaKey
  label: string
  color: string
  icon: string
  isPeople?: boolean
  items: LifeItem[]
}

export type TrainingLevel = 'none' | 'light' | 'hard'

export type CheckinRecord = {
  date: string
  sleepHours: number
  training: TrainingLevel
  nutrition: number
  mood: number
  energy: number
  note: string
}

type LifeItemRow = { id: string; area: LifeAreaKey; name: string; value: number; sortOrder: number }
type LifeApiResponse = { items: LifeItemRow[]; checkins: CheckinRecord[] }

export type LifeState = {
  areas: LifeArea[]
  checkins: Record<string, CheckinRecord>
}

export const AREA_ORDER: LifeAreaKey[] = [
  'corpo',
  'mente',
  'relacionamentos',
  'recursos',
  'experiencias',
]

export const AREA_META: Record<
  LifeAreaKey,
  { label: string; color: string; icon: string }
> = {
  corpo: { label: 'Corpo', color: '#30a46c', icon: 'activity' },
  mente: { label: 'Mente', color: '#5856d6', icon: 'brain' },
  relacionamentos: { label: 'Relacionamentos', color: '#ff2d55', icon: 'users' },
  recursos: { label: 'Recursos', color: '#0a84ff', icon: 'wallet' },
  experiencias: { label: 'Experiências', color: '#ff9500', icon: 'compass' },
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FLAG_THRESHOLD = 4
const VARIANCE_THRESHOLD = 1.8

function avg(items: LifeItem[]): number {
  if (!items.length) return 0
  return items.reduce((s, i) => s + i.value, 0) / items.length
}
function stdDev(items: LifeItem[]): number {
  if (items.length < 2) return 0
  const m = avg(items)
  const v = items.reduce((s, i) => s + (i.value - m) ** 2, 0) / items.length
  return Math.sqrt(v)
}

function buildAreas(rows: LifeItemRow[]): LifeArea[] {
  return AREA_ORDER.map((key) => ({
    key,
    ...AREA_META[key],
    isPeople: key === 'relacionamentos',
    items: rows
      .filter((r) => r.area === key)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ id: r.id, name: r.name, value: r.value })),
  }))
}

const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n)))

export type TaskStat = { total: number; open: number; done: number }
const EMPTY_STAT: TaskStat = { total: 0, open: 0, done: 0 }

// Peso da auto-avaliação (sliders/check-in) vs. conclusão das tarefas ligadas.
const SELF_WEIGHT = 0.7
const TASK_WEIGHT = 0.3

export function useLifeTracker() {
  const state = useState<LifeState>('life:state', () => ({ areas: [], checkins: {} }))
  const loading = useState('life:loading', () => false)
  const error = useState<string | null>('life:error', () => null)
  const loaded = useState('life:loaded', () => false)
  const { list: taskList } = useTasks()

  // ── Atividade de tarefas por área / item ─────────────────
  const taskStats = computed(() => {
    const byArea: Record<string, TaskStat> = {}
    const byItem: Record<string, TaskStat> = {}
    for (const t of taskList.value) {
      if (t.archived || !t.lifeArea) continue
      const a = (byArea[t.lifeArea] ??= { total: 0, open: 0, done: 0 })
      a.total++
      t.done ? a.done++ : a.open++
      if (t.lifeItemId) {
        const it = (byItem[t.lifeItemId] ??= { total: 0, open: 0, done: 0 })
        it.total++
        t.done ? it.done++ : it.open++
      }
    }
    return { byArea, byItem }
  })
  const areaTaskStats = (key: LifeAreaKey): TaskStat => taskStats.value.byArea[key] ?? EMPTY_STAT
  const itemTaskStats = (id: string): TaskStat => taskStats.value.byItem[id] ?? EMPTY_STAT

  // ── Carga ────────────────────────────────────────────────
  async function refresh() {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<LifeApiResponse>('/api/life')
      // Não sobrescreve o estado otimista enquanto há mutações pendentes desta
      // entidade (a leitura pode vir do cache velho do SW, sem elas).
      if (!(await hasPendingForEntity('life'))) {
        state.value = {
          areas: buildAreas(res.items),
          checkins: Object.fromEntries(res.checkins.map((c) => [c.date, c])),
        }
      }
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar vida.'
    } finally {
      loading.value = false
    }
  }
  function ensureLoaded() {
    if (import.meta.client && !loaded.value) {
      loaded.value = true
      void refresh()
    }
  }

  function findItem(areaKey: LifeAreaKey, itemId: string) {
    return state.value.areas.find((a) => a.key === areaKey)?.items.find((i) => i.id === itemId)
  }

  // ── Agregações ───────────────────────────────────────────
  // Auto-avaliação pura (sliders/check-in), 0–100.
  const selfScore = (a: LifeArea) => Math.round(avg(a.items) * 10)
  // Nota exibida: mistura auto-avaliação com a conclusão das tarefas ligadas
  // (quando existem). Itens sem tarefas usam só a auto-avaliação.
  const areaScore = (a: LifeArea) => {
    const self = avg(a.items) * 10
    const s = taskStats.value.byArea[a.key]
    if (!s || s.total === 0) return Math.round(self)
    const completion = s.done / s.total
    return Math.round(self * SELF_WEIGHT + completion * 100 * TASK_WEIGHT)
  }

  function areaAlert(a: LifeArea): { type: 'low' | 'variance'; names: string[] } | null {
    if (!a.items.length) return null
    const flagged = a.items.filter((i) => i.value <= FLAG_THRESHOLD)
    if (flagged.length) return { type: 'low', names: flagged.map((f) => f.name) }
    if (stdDev(a.items) > VARIANCE_THRESHOLD) return { type: 'variance', names: [] }
    return null
  }

  const overallScore = computed(() => {
    const scores = state.value.areas.filter((a) => a.items.length).map(areaScore)
    if (!scores.length) return 0
    return Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)
  })

  const alertedAreas = computed(() => state.value.areas.filter((a) => areaAlert(a)))

  const weakestInsight = computed(() => {
    const flaggedArea = state.value.areas.find((a) => areaAlert(a)?.type === 'low')
    if (flaggedArea) {
      const a = areaAlert(flaggedArea)!
      return {
        area: flaggedArea,
        title: `Atenção em ${flaggedArea.label}`,
        text: `${a.names[0]} está com nota baixa enquanto o resto vai bem. A média esconde isso.`,
      }
    }
    const varianceArea = state.value.areas.find((a) => areaAlert(a)?.type === 'variance')
    if (varianceArea) {
      return {
        area: varianceArea,
        title: `Variação alta em ${varianceArea.label}`,
        text: 'Alguns itens muito bem, outros nem tanto. Veja os detalhes.',
      }
    }
    return null
  })

  // ── Check-in diário ──────────────────────────────────────
  const todayCheckin = computed<CheckinRecord | null>(
    () => state.value.checkins[todayKey()] ?? null,
  )
  const hasCheckedInToday = computed(() => !!todayCheckin.value)

  const streak = computed(() => {
    let n = 0
    const d = new Date()
    while (state.value.checkins[todayKey(d)]) {
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  })

  function applyCheckinToItems(rec: CheckinRecord) {
    const set = (areaKey: LifeAreaKey, name: string, value: number) => {
      const item = state.value.areas
        .find((a) => a.key === areaKey)
        ?.items.find((i) => i.name === name)
      if (item) item.value = clamp10(value)
    }
    set('corpo', 'Sono', (rec.sleepHours / 8) * 10)
    set('corpo', 'Treino', rec.training === 'hard' ? 9 : rec.training === 'light' ? 6 : 2)
    set('corpo', 'Alimentação', rec.nutrition)
    set('mente', 'Saúde mental', rec.mood)
  }

  async function submitCheckin(input: Omit<CheckinRecord, 'date'>) {
    const rec: CheckinRecord = { ...input, date: todayKey() }
    // Otimista: registra e reflete nos itens.
    state.value.checkins = { ...state.value.checkins, [rec.date]: rec }
    applyCheckinToItems(rec)
    try {
      await $fetch('/api/life/checkin', { method: 'POST', body: rec })
      await refresh()
    } catch (e) {
      if (!isOfflineError(e)) {
        error.value = (e as { message?: string })?.message ?? 'Falha ao salvar check-in.'
        return
      }
      await queueRequest('life', 'CREATE', 'POST', '/api/life/checkin', rec)
    }
  }

  // ── Edição de itens ──────────────────────────────────────
  async function setItemValue(areaKey: LifeAreaKey, itemId: string, value: number) {
    const item = findItem(areaKey, itemId)
    if (!item) return
    item.value = clamp10(value)
    const body = { value: item.value }
    try {
      await $fetch(`/api/life/items/${itemId}`, { method: 'PATCH', body })
    } catch (e) {
      if (!isOfflineError(e)) return
      await queueRequest('life', 'UPDATE', 'PATCH', `/api/life/items/${itemId}`, body)
    }
  }

  async function renameItem(areaKey: LifeAreaKey, itemId: string, name: string) {
    const item = findItem(areaKey, itemId)
    if (!item || !name.trim()) return
    item.name = name.trim()
    const body = { name: item.name }
    try {
      await $fetch(`/api/life/items/${itemId}`, { method: 'PATCH', body })
    } catch (e) {
      if (!isOfflineError(e)) return
      await queueRequest('life', 'UPDATE', 'PATCH', `/api/life/items/${itemId}`, body)
    }
  }

  async function addItem(areaKey: LifeAreaKey, name: string): Promise<LifeItem | null> {
    if (!name.trim()) return null
    // Id gerado no cliente e enviado ao servidor: vira a fonte da verdade, então
    // tarefas que apontam para este item não ficam com lifeItemId "stale" no sync.
    const id = import.meta.client ? crypto.randomUUID() : undefined
    const body = id ? { id, area: areaKey, name: name.trim() } : { area: areaKey, name: name.trim() }
    const area = state.value.areas.find((a) => a.key === areaKey)
    try {
      const row = await $fetch<LifeItemRow>('/api/life/items', { method: 'POST', body })
      const item = { id: row.id, name: row.name, value: row.value }
      if (area) area.items.push(item)
      return item
    } catch (e) {
      if (!isOfflineError(e)) return null
      const item = {
        id: id ?? `tmp-${name}`,
        name: body.name,
        value: 7,
      }
      if (area) area.items.push(item)
      await queueRequest('life', 'CREATE', 'POST', '/api/life/items', body)
      return item
    }
  }

  async function removeItem(areaKey: LifeAreaKey, itemId: string) {
    const area = state.value.areas.find((a) => a.key === areaKey)
    if (!area || area.items.length <= 1) return
    area.items = area.items.filter((i) => i.id !== itemId)
    try {
      await $fetch(`/api/life/items/${itemId}`, { method: 'DELETE' })
    } catch (e) {
      if (!isOfflineError(e)) {
        await refresh()
        return
      }
      await queueRequest('life', 'DELETE', 'DELETE', `/api/life/items/${itemId}`)
    }
  }

  return {
    state,
    loading,
    error,
    refresh,
    ensureLoaded,
    areaScore,
    selfScore,
    areaTaskStats,
    itemTaskStats,
    areaAlert,
    overallScore,
    alertedAreas,
    weakestInsight,
    todayCheckin,
    hasCheckedInToday,
    streak,
    submitCheckin,
    setItemValue,
    addItem,
    renameItem,
    removeItem,
  }
}

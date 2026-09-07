import { addDays, addMonths, fmtDate } from '~/utils/dates'

export type AgendaView = 'day' | 'week' | 'month'

/** @deprecated Nome antigo, mantido enquanto os componentes migram. */
export type TimelineView = AgendaView

export type AgendaRange = {
  from: string
  to: string
  start: Date
  end: Date
  /** Quantidade de dias (colunas) na janela visível. */
  days: number
  /**
   * Dia/mês "âncora" da janela — usado para rótulos. No modo mês a janela é
   * estendida para semanas completas (grade 6×7), então `start` pode cair no
   * mês anterior; `anchor` aponta sempre para o 1º dia do mês focado.
   */
  anchor: Date
}

/** @deprecated Nome antigo, mantido enquanto os componentes migram. */
export type TimelineRange = AgendaRange

export const VIEW_DAYS: Record<AgendaView, number> = { day: 1, week: 7, month: 0 }

/** Faixas do filtro da visão de atrasados. `null` = sem limite inferior. */
export type OverdueRange = '7' | '30' | 'all'
export const OVERDUE_RANGE_DAYS: Record<OverdueRange, number | null> = {
  '7': 7,
  '30': 30,
  all: null,
}

/** Segunda-feira da semana que contém `d` (semana começa na segunda). */
function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Navegação da janela da agenda (dia / semana / mês + deslocamento).
 *
 * ─── Por que a `key` é obrigatória ───
 * Antes o estado morava em `useState('agenda:tlView')` e `useState('agenda:tlOffset')`,
 * SEM chave por tela. Como `/agenda` e as abas Calendário/Timeline de `/trabalho`
 * usavam o mesmo composable, navegar uma semana numa das telas movia a outra
 * junto, em silêncio. Cada tela agora declara a sua chave.
 *
 * A janela continua 100% client-side: mudar de semana não depende de rede.
 */
export function useAgendaWindow(key: string, defaultView: AgendaView = 'week') {
  const view = useState<AgendaView>(`agenda:${key}:view`, () => defaultView)
  /** Deslocamento em unidades da janela atual (dias / semanas / meses). */
  const offset = useState<number>(`agenda:${key}:offset`, () => 0)

  const range = computed<AgendaRange>(() => {
    const t = today()
    let start: Date
    let days: number
    let anchor: Date
    if (view.value === 'day') {
      start = addDays(t, offset.value)
      days = 1
      anchor = start
    } else if (view.value === 'week') {
      start = addDays(startOfWeek(t), offset.value * 7)
      days = 7
      anchor = start
    } else {
      // Mês: estende a janela para semanas completas (segunda→domingo) para
      // formar a grade 6×7. Os dias vizinhos exibidos esmaecidos já vêm com
      // seus itens, sem busca extra.
      anchor = addMonths(startOfMonth(t), offset.value)
      const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
      start = startOfWeek(anchor)
      const gridEnd = addDays(startOfWeek(monthEnd), 6)
      days = Math.round((gridEnd.getTime() - start.getTime()) / 86_400_000) + 1
    }
    const end = addDays(start, days - 1)
    return { from: fmtDate(start), to: fmtDate(end), start, end, days, anchor }
  })

  function goToToday() {
    offset.value = 0
  }

  function step(delta: number) {
    offset.value += delta
  }

  /** Aponta a janela para o dia `dateKey`, no modo dia. */
  function focusDay(dateKey: string) {
    const target = new Date(`${dateKey}T12:00:00`)
    target.setHours(0, 0, 0, 0)
    view.value = 'day'
    offset.value = Math.round((target.getTime() - today().getTime()) / 86_400_000)
  }

  return { view, offset, range, goToToday, step, focusDay, VIEW_DAYS }
}

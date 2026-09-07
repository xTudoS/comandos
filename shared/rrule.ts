/**
 * Recorrência — subconjunto de RRULE (RFC 5545). Lógica pura, sem banco e sem Vue.
 *
 * Roda nos DOIS lados: o servidor expande a série para responder à agenda, e o
 * cliente expande a mesma série sobre o cache local quando está offline. Um
 * código só, como `shared/boardOrder.ts`.
 *
 * ─── Por que RRULE em texto, e não colunas estruturadas ───
 * Colunas (`freq`/`interval`/`byday`/`count`/`until`) pediriam uma migração a
 * cada capacidade nova. Uma coluna `text` absorve o crescimento e ainda dá
 * interoperabilidade com .ics e Google Calendar sem camada de tradução.
 *
 * ─── ATENÇÃO: o `Date.UTC` daqui está CERTO ───
 * Todo cálculo abaixo é aritmética de CALENDÁRIO sobre strings `YYYY-MM-DD`:
 * não existe instante, não existe fuso, e `Date` é usado só como calculadora de
 * calendário. Isso é categoricamente diferente do bug de
 * `new Date().toISOString().slice(0, 10)` documentado em `app/utils/overdue.ts`,
 * onde um INSTANTE real é convertido para UTC e o dia vira o errado depois das
 * 21h em Brasília. **Não "corrija" o `Date.UTC` deste arquivo para hora local** —
 * hora local aqui reintroduz erro de fronteira de horário de verão.
 *
 * O subconjunto suportado é deliberadamente pequeno, e tudo fora dele é
 * REJEITADO em vez de ignorado: uma `BYMONTHDAY` silenciosamente descartada
 * viraria uma série que o usuário acha que configurou e que nunca acontece.
 */

export type RRuleFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export type RRuleWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export type RRule = {
  freq: RRuleFreq
  /** Sempre >= 1. Ausente na string equivale a 1. */
  interval: number
  /** Só existe em `FREQ=WEEKLY`. Ordenado a partir de segunda. */
  byDay: RRuleWeekday[] | null
  /** Número total de ocorrências da série, contando a primeira. */
  count: number | null
  /** `YYYY-MM-DD`, inclusivo. Mutuamente exclusivo com `count`. */
  until: string | null
}

const FREQS: readonly RRuleFreq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']

/** Índice do `getUTCDay()`: domingo é 0. */
const WEEKDAY_INDEX: Record<RRuleWeekday, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

/**
 * Ordem canônica a partir de segunda — a semana começa na segunda em todo o
 * app (`useAgendaTimeline`, `AgendaMonth`), e coincide com o `WKST=MO` que o
 * RFC 5545 usa como padrão. Não emitimos `WKST`; ele é sempre o padrão.
 */
const WEEKDAY_ORDER: readonly RRuleWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

const DAY_MS = 86_400_000

// ── Aritmética de calendário ────────────────────────────────────────────────

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function toUTC(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return fromUTC(toUTC(date) + days * DAY_MS)
}

/** Dias de `a` até `b` (negativo se `b` for antes). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS)
}

/**
 * Soma meses preservando o dia, com clamp para o último dia válido:
 * 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto).
 *
 * Movido de `server/utils/paymentsService.ts` (era `nextDueDate`), onde já
 * estava correto e testado na prática — o comportamento é preservado byte a
 * byte, só mudou de casa para poder ser reusado pelas outras entidades.
 */
export function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(Date.UTC(y!, m! - 1 + months, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth()
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return fromUTC(Date.UTC(targetYear, targetMonth, Math.min(d!, lastDay)))
}

/** Segunda-feira da semana de `date`. */
export function startOfWeekMonday(date: string): string {
  const dow = new Date(toUTC(date)).getUTCDay()
  return addDays(date, -((dow + 6) % 7))
}

// ── Parse e serialização ────────────────────────────────────────────────────

function parsePositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 ? n : null
}

/** Aceita `YYYYMMDD` (RFC) e `YYYY-MM-DD` (o que o resto do app usa). */
function parseUntil(raw: string): string | null {
  const bare = raw.endsWith('Z') ? raw.slice(0, -1) : raw
  const dateOnly = bare.includes('T') ? bare.slice(0, bare.indexOf('T')) : bare
  const candidate = /^\d{8}$/.test(dateOnly)
    ? `${dateOnly.slice(0, 4)}-${dateOnly.slice(4, 6)}-${dateOnly.slice(6, 8)}`
    : dateOnly
  if (!isDateString(candidate)) return null
  // Rejeita 2026-02-31 e afins: a round-trip só bate se a data existe.
  return fromUTC(toUTC(candidate)) === candidate ? candidate : null
}

/**
 * `null` quando a string não é uma regra suportada. Nunca lança — quem valida
 * na fronteira (zod, no schema do endpoint) usa isto num `.refine()`.
 */
export function parseRRule(input: string): RRule | null {
  if (typeof input !== 'string') return null
  const body = input.trim().replace(/^RRULE:/i, '')
  if (!body) return null

  const seen = new Set<string>()
  let freq: RRuleFreq | null = null
  let interval = 1
  let byDay: RRuleWeekday[] | null = null
  let count: number | null = null
  let until: string | null = null

  for (const part of body.split(';')) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq <= 0) return null
    const key = part.slice(0, eq).toUpperCase()
    const value = part.slice(eq + 1).toUpperCase()
    // Chave repetida é ambígua; recusar em vez de eleger a última.
    if (seen.has(key)) return null
    seen.add(key)

    switch (key) {
      case 'FREQ': {
        if (!FREQS.includes(value as RRuleFreq)) return null
        freq = value as RRuleFreq
        break
      }
      case 'INTERVAL': {
        const parsed = parsePositiveInt(value)
        if (parsed === null) return null
        interval = parsed
        break
      }
      case 'COUNT': {
        const parsed = parsePositiveInt(value)
        if (parsed === null) return null
        count = parsed
        break
      }
      case 'UNTIL': {
        const parsed = parseUntil(value)
        if (parsed === null) return null
        until = parsed
        break
      }
      case 'BYDAY': {
        const days = value.split(',').filter(Boolean)
        if (days.length === 0) return null
        const unique = new Set<RRuleWeekday>()
        for (const day of days) {
          if (!(day in WEEKDAY_INDEX)) return null
          unique.add(day as RRuleWeekday)
        }
        byDay = WEEKDAY_ORDER.filter((d) => unique.has(d))
        break
      }
      // WKST é sempre MO aqui; aceitar outro valor seria mentir sobre o
      // resultado, já que a expansão não o usa.
      default:
        return null
    }
  }

  if (!freq) return null
  if (count !== null && until !== null) return null
  if (byDay && freq !== 'WEEKLY') return null

  return { freq, interval, byDay, count, until }
}

/** Serializa no formato do RFC (`UNTIL` em `YYYYMMDD`). */
export function formatRRule(rule: RRule): string {
  const parts = [`FREQ=${rule.freq}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(',')}`)
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`)
  if (rule.until !== null) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}`)
  return parts.join(';')
}

/**
 * `payment_recurrence` → RRULE. A tabela `payments` mantém o enum (mexer em
 * pgEnum é caro — ver a migração `0023_same_siren.sql`, escrita à mão), então a
 * tradução vive aqui em vez de no banco.
 */
export function recurrenceToRRule(
  recurrence: 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
): string | null {
  switch (recurrence) {
    case 'none':
      return null
    case 'weekly':
      return 'FREQ=WEEKLY'
    case 'monthly':
      return 'FREQ=MONTHLY'
    case 'quarterly':
      return 'FREQ=MONTHLY;INTERVAL=3'
    case 'yearly':
      return 'FREQ=YEARLY'
  }
}

// ── Expansão ────────────────────────────────────────────────────────────────

/** Teto de segurança: uma janela de agenda nunca precisa de mais que isto. */
const DEFAULT_MAX_OCCURRENCES = 1000

/** Trava contra laço infinito em regra sem `COUNT` nem `UNTIL`. */
const MAX_STEPS = 20_000

export type ExpandWindow = {
  /** `YYYY-MM-DD`, inclusivo. */
  from: string
  /** `YYYY-MM-DD`, inclusivo. */
  to: string
  /** Padrão 1000. Atingir o teto trunca em silêncio — confira `length`. */
  max?: number
}

/**
 * Datas da série que caem em `[from, to]`.
 *
 * `startsOn` é a âncora (o `DTSTART`). Em `FREQ=WEEKLY` com `BYDAY`, a série é
 * gerada pelos dias listados a partir da SEMANA de `startsOn`; se o dia da
 * semana de `startsOn` não estiver em `BYDAY`, ele **não** é ocorrência. Quem
 * cria a série deve encaixar `starts_on` no primeiro dia válido — use
 * `firstOccurrenceOnOrAfter` para isso.
 */
export function expandRRule(rule: RRule, startsOn: string, window: ExpandWindow): string[] {
  if (!isDateString(startsOn) || !isDateString(window.from) || !isDateString(window.to)) return []
  if (window.to < window.from) return []

  const max = window.max ?? DEFAULT_MAX_OCCURRENCES
  if (max <= 0) return []

  // O fim efetivo é o mais cedo entre a janela e o UNTIL da regra.
  const hardEnd = rule.until && rule.until < window.to ? rule.until : window.to
  if (hardEnd < startsOn) return []

  const out: string[] = []

  // Com COUNT é preciso contar desde a PRIMEIRA ocorrência da série, mesmo que
  // ela esteja muito antes da janela — então não dá para pular direto. Sem
  // COUNT, avançar direto até a janela evita percorrer anos de datas
  // descartadas (série diária que começou em 2015, janela de uma semana).
  const counting = rule.count !== null
  let emitted = 0
  let steps = 0

  for (const date of iterateOccurrences(rule, startsOn, counting ? startsOn : window.from)) {
    if (++steps > MAX_STEPS) break
    if (counting) {
      if (emitted >= rule.count!) break
      emitted++
    }
    if (date > hardEnd) break
    if (date < window.from) continue
    out.push(date)
    if (out.length >= max) break
  }

  return out
}

/**
 * Primeira ocorrência em `on` ou depois. `null` se a série acaba antes disso
 * (por `UNTIL` ou por `COUNT`). Útil para encaixar `starts_on` num `BYDAY` e
 * para o "próximo vencimento" de um pagamento recorrente.
 */
export function firstOccurrenceOnOrAfter(
  rule: RRule,
  startsOn: string,
  on: string,
): string | null {
  // Janela de ~10 anos: se nada acontece nesse intervalo, "próxima ocorrência"
  // não é uma resposta útil de qualquer forma.
  const found = expandRRule(rule, startsOn, { from: on, to: addMonthsClamped(on, 120), max: 1 })
  return found[0] ?? null
}

/**
 * Gera as datas da série em ordem crescente, começando na primeira ocorrência
 * em `notBefore` ou depois. Não conhece `UNTIL`, `COUNT` nem teto — quem chama
 * é que para.
 */
function* iterateOccurrences(
  rule: RRule,
  startsOn: string,
  notBefore: string,
): Generator<string> {
  const target = notBefore > startsOn ? notBefore : startsOn

  if (rule.freq === 'WEEKLY' && rule.byDay?.length) {
    const stepDays = rule.interval * 7
    // Semana-âncora: a primeira cujo ÚLTIMO dia (domingo) já alcança o alvo.
    let weekStart = startOfWeekMonday(startsOn)
    const gap = daysBetween(addDays(weekStart, 6), target)
    if (gap > 0) weekStart = addDays(weekStart, Math.floor(gap / stepDays) * stepDays)
    // Offsets a partir de segunda, já em ordem crescente.
    const offsets = rule.byDay.map((d) => (WEEKDAY_INDEX[d] + 6) % 7).sort((a, b) => a - b)
    for (;;) {
      for (const offset of offsets) {
        const date = addDays(weekStart, offset)
        // Um BYDAY anterior ao DTSTART dentro da própria semana-âncora não conta.
        if (date >= startsOn && date >= target) yield date
      }
      weekStart = addDays(weekStart, stepDays)
    }
  }

  if (rule.freq === 'DAILY' || rule.freq === 'WEEKLY') {
    const stepDays = rule.freq === 'DAILY' ? rule.interval : rule.interval * 7
    const gap = daysBetween(startsOn, target)
    const skip = gap > 0 ? Math.floor(gap / stepDays) : 0
    let date = addDays(startsOn, skip * stepDays)
    for (;;) {
      if (date >= target) yield date
      date = addDays(date, stepDays)
    }
  }

  // MONTHLY / YEARLY — passo em meses, com clamp de fim de mês.
  const monthStep = rule.freq === 'YEARLY' ? rule.interval * 12 : rule.interval
  const [sy, sm] = startsOn.split('-').map(Number)
  const [ty, tm] = target.split('-').map(Number)
  const monthGap = (ty! - sy!) * 12 + (tm! - sm!)
  // Recua um passo: o clamp pode empurrar a data para trás dentro do mês, então
  // a estimativa pode ter passado do ponto.
  let n = monthGap > 0 ? Math.max(0, Math.floor(monthGap / monthStep) - 1) : 0
  for (;;) {
    const date = addMonthsClamped(startsOn, n * monthStep)
    if (date >= target) yield date
    n++
  }
}

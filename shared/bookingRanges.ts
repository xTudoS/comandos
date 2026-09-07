/**
 * Faixas livres do dia — lógica pura, sem banco e sem Vue.
 *
 * O modelo antigo era o de um Calendly: o dono configurava janelas semanais e o
 * servidor cuspia uma grade de slots de 30min. A grade é uma cerca artificial —
 * uma reunião de 20 ou 45 minutos simplesmente não cabia nela.
 *
 * Aqui a lógica se inverte. O dia inteiro está aberto por padrão; o que o
 * servidor calcula são os **buracos**: as faixas contínuas que sobram depois de
 * descontar tudo que já está ocupado. Um dia vazio devolve `00:00–23:59`; um dia
 * com dois compromissos devolve `00:00–09:30 · 10:00–12:00 · 13:00–23:59`. O
 * visitante lê a faixa e escolhe o intervalo que quiser dentro dela.
 *
 * Este módulo **não lê o relógio**. Quem sabe que horas são (e em que fuso) é
 * `server/utils/clock.ts`, que passa o corte pronto em `fromMin`. Sem essa
 * separação, todo teste daqui precisaria de mock de tempo.
 */

/** Intervalo em minutos desde 00:00. Meio-aberto: `[start, end)`. */
export type Interval = { start: number; end: number }

/** Faixa em relógio de parede, pronta para a tela. */
export type TimeRange = { start: string; end: string }

/**
 * O dia fecha em 23:59, não em 24:00.
 *
 * É o que o usuário pediu ao descrever a feature ("ex: 00:00-23:59") e evita a
 * pergunta sem resposta boa de como renderizar um fim de faixa às 24:00 — que
 * não é um horário que exista num `<input type="time">`. O preço é um minuto
 * inalcançável por dia, à meia-noite. Ninguém agenda às 23:59.
 */
export const DAY_END_MIN = 1439

/** Minutos num dia. Usado para rebasear a véspera no dia consultado. */
export const DAY_MINUTES = 1440

/**
 * Faixa mais curta que vale a pena mostrar.
 *
 * Sem isso, dois compromissos separados por três minutos viram uma linha
 * "10:02 – 10:05" na lista — ruído que só atrapalha quem está escolhendo.
 */
export const MIN_RANGE_MIN = 5

/** 'HH:MM' → minutos desde 00:00. Entrada malformada vira 0 (não lança). */
export function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Minutos desde 00:00 → 'HH:MM', sempre com dois dígitos. */
export function minToTime(min: number): string {
  const clamped = Math.max(0, Math.min(min, DAY_END_MIN))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Normaliza uma lista de ocupados: descarta os vazios/invertidos, corta no
 * intervalo do dia e funde tudo que se toca ou se sobrepõe.
 *
 * Fundir adjacentes (`[540,600)` + `[600,660)` → `[540,660)`) não é preciosismo:
 * sem isso a subtração devolveria uma faixa livre de comprimento zero entre os
 * dois, e ela viraria uma linha fantasma na lista.
 */
export function mergeIntervals(busy: Interval[]): Interval[] {
  const clipped = busy
    .map((b) => ({
      start: Math.max(0, b.start),
      end: Math.min(b.end, DAY_END_MIN),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const out: Interval[] = []
  for (const cur of clipped) {
    const last = out[out.length - 1]
    // `>=` e não `>`: adjacente funde junto com sobreposto.
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else out.push({ ...cur })
  }
  return out
}

/** Buracos de `day` depois de remover `busy`. Espera `busy` já normalizado. */
export function subtractIntervals(day: Interval, busy: Interval[]): Interval[] {
  const out: Interval[] = []
  let cursor = day.start
  for (const b of busy) {
    if (b.end <= cursor) continue
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, day.end) })
    cursor = Math.max(cursor, b.end)
    if (cursor >= day.end) break
  }
  if (cursor < day.end) out.push({ start: cursor, end: day.end })
  return out.filter((r) => r.end > r.start)
}

/**
 * As faixas livres do dia, prontas para exibir.
 *
 * `fromMin` corta o começo do dia — é por onde entra "esconder o que já passou"
 * quando a data escolhida é hoje. `minLen` descarta os cacos curtos demais.
 */
export function freeRanges(
  busy: Interval[],
  opts: { fromMin?: number; minLen?: number } = {},
): TimeRange[] {
  const from = Math.max(0, Math.min(opts.fromMin ?? 0, DAY_END_MIN))
  const minLen = opts.minLen ?? MIN_RANGE_MIN
  const gaps = subtractIntervals({ start: from, end: DAY_END_MIN }, mergeIntervals(busy))
  return gaps
    .filter((r) => r.end - r.start >= minLen)
    .map((r) => ({ start: minToTime(r.start), end: minToTime(r.end) }))
}

/**
 * O intervalo pedido cabe inteiro dentro de **uma única** faixa livre?
 *
 * Precisa ser uma só: um pedido que atravessa duas faixas atravessa, por
 * definição, o compromisso que está entre elas. Colar no limite vale — os
 * intervalos são meio-abertos, então 09:00–09:30 cabe em 09:00–09:30.
 */
export function fitsInFreeRange(req: Interval, free: TimeRange[]): boolean {
  if (req.end <= req.start) return false
  return free.some(
    (r) => timeToMin(r.start) <= req.start && req.end <= timeToMin(r.end),
  )
}

/**
 * Duração legível: `30 min`, `1h`, `2h30`.
 *
 * Some o `min` a partir de uma hora porque a unidade já está implícita no `h` —
 * "1h30min" é como ninguém fala.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
export const DOW_FULL = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const
export const DOW_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const
export const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

// Format a Date (or ISO string) as YYYY-MM-DD in local calendar terms.
// Accepts either "YYYY-MM-DD" or a full Date; when given a bare date-string
// we parse it at local noon to sidestep DST-boundary surprises.
export function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

export function sameDay(a: Date | string, b: Date | string): boolean {
  return fmtDate(a) === fmtDate(b)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

// dd/MM for compact topbar display.
export function fmtBRDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : d
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function fmtNowStamp(): string {
  const d = new Date()
  return `${fmtBRDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

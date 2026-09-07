import type { Task } from '~/composables/useTasks'

/** Data de vencimento efetiva: agendamento ou, se ativo, a data de follow-up. */
export function dueDate(t: Task): string | null {
  return t.scheduledDate ?? (t.followupActive ? t.followupDate : null)
}

/**
 * Chave de ordenação data+hora: ordena por data e, dentro do mesmo dia,
 * prioriza tarefas com horário agendado (data+hora) antes das só-data — a hora
 * ausente vira sentinela alta ('99:99') para ir ao fim do dia.
 */
export function dateTimeKey(t: Task): string {
  const d = dueDate(t) ?? '9999-99-99'
  const time = t.scheduledDate && t.scheduledTime ? t.scheduledTime : '99:99'
  return `${d}T${time}`
}

/** Faixa de vencimento: 0 = data+hora, 1 = só data, 2 = sem data. */
export function dueRank(t: Task): number {
  if (!dueDate(t)) return 2
  return t.scheduledDate && t.scheduledTime ? 0 : 1
}

export function compareAz(a: Task, b: Task) {
  return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' })
}

/**
 * Ordenação por vencimento: três faixas, nesta ordem — 1) tarefas com data E
 * horário, 2) tarefas só com data, 3) sem data (A–Z). Dentro das faixas 1 e 2
 * ordena pela própria data/hora.
 */
export function compareByDue(a: Task, b: Task) {
  const ra = dueRank(a)
  const rb = dueRank(b)
  if (ra !== rb) return ra - rb
  if (ra === 2) return compareAz(a, b)
  return dateTimeKey(a).localeCompare(dateTimeKey(b))
}

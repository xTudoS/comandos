import { fmtDate } from '~/utils/dates'

/**
 * Regra única de "atrasado" no cliente.
 *
 * Extraída de `app/components/tarefas/ListView.vue`, onde já rodava em
 * produção como a única marcação de atraso do app. Agora é compartilhada com a
 * agenda (`AgendaEventCard`, `useAgendaItems`) e com o badge do menu, para que
 * as quatro superfícies não divirjam.
 *
 * Não existe coluna `due_date` no schema: o vencimento é derivado de
 * `scheduledDate`, com `followupDate` como segunda opção quando o follow-up
 * está ativo.
 */

/** Data de vencimento efetiva (`YYYY-MM-DD`) ou null se a tarefa não tem data. */
export function dueOf(t: {
  scheduledDate?: string | null
  followupActive?: boolean | null
  followupDate?: string | null
}): string | null {
  return t.scheduledDate ?? (t.followupActive ? t.followupDate : null) ?? null
}

/**
 * Hoje em `YYYY-MM-DD`, no fuso local — mesmo formato das colunas `date`.
 *
 * A versão original em ListView usava `toISOString().slice(0, 10)`, que é UTC:
 * das 21h em diante no horário de Brasília ele já devolvia o dia seguinte e
 * marcava como atrasada uma tarefa que vencia só no dia seguinte. `fmtDate`
 * resolve local e é a mesma função que a agenda usa para montar datas.
 */
export function todayISO(): string {
  return fmtDate(new Date())
}

/** Tarefa concluída nunca conta como atrasada, mesmo com data vencida. */
export function isOverdue(t: {
  scheduledDate?: string | null
  followupActive?: boolean | null
  followupDate?: string | null
  done?: boolean | null
}): boolean {
  const d = dueOf(t)
  if (!d || t.done) return false
  return d < todayISO()
}

/**
 * Mesma regra para um item da agenda, que já traz a data resolvida em vez da
 * linha crua — vale para tarefa, follow-up, meta e pagamento igualmente.
 *
 * O atraso continua sendo derivado NO CLIENTE, e não no servidor: o servidor
 * não conhece o fuso do usuário (não existe coluna de timezone em `users`), e
 * "atrasado" é uma pergunta sobre o dia de hoje no relógio de quem olha.
 */
export function isAgendaItemOverdue(item: { date: string; done: boolean }): boolean {
  if (item.done) return false
  return item.date < todayISO()
}

/**
 * @deprecated Use `isAgendaItemOverdue`. Mantida enquanto restarem chamadas com
 * o shape antigo de `TimelineEvent` (`{ date, task: { done } }`).
 */
export function isEventOverdue(e: { date: string; task: { done: boolean } }): boolean {
  return isAgendaItemOverdue({ date: e.date, done: e.task.done })
}

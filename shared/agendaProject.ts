/**
 * Projeção da agenda — de linhas de domínio para `AgendaItem`. Puro, sem banco
 * e sem Vue.
 *
 * Este módulo existe para que servidor e cliente produzam o MESMO item. Antes
 * havia duas projeções escritas à mão (`server/utils/agendaService.ts` e
 * `app/composables/useAgendaTimeline.ts`) e elas já tinham divergido: campos
 * diferentes e ordenação oposta para item sem hora. O servidor alimenta estas
 * funções com linhas do Postgres; o cliente, com as listas que já mantém em
 * cache — e é isso que permite a agenda pintar offline, sem esperar a rede.
 *
 * As entradas são shapes MÍNIMOS, não os tipos de nenhuma das duas pontas: o
 * servidor tem linhas Drizzle em inglês, o cliente tem lista PT em store e EN em
 * composable. Cada lado adapta na borda; aqui no meio a regra é uma só.
 */

import {
  blockEnd,
  normalizeTime,
  type AgendaItem,
  type AgendaItemKind,
  type AgendaTone,
} from './agendaItem'
import { sortAgendaItems } from './agendaSort'

export type TaskSource = {
  id: string
  title: string
  /** `ceo` | `delegate` | `personal` — vira o `tone` do item agendado. */
  type: string
  done: boolean
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number | null
  followupActive: boolean
  followupDate: string | null
  projectId: string | null
  companyId: string | null
  delegatePersonId: string | null
  delegatePersonName: string | null
}

export type GoalSource = {
  id: string
  title: string
  dueDate: string | null
  companyId: string | null
  /**
   * Metas não têm coluna `done` — a conclusão é derivada do progresso agregado.
   * Quem chama resolve: o servidor conta as ações, o cliente usa o `statusMeta`
   * que o store já calcula. Assim os dois querem dizer a mesma coisa.
   */
  done: boolean
}

export type PaymentSource = {
  id: string
  description: string
  amountCents: number
  dueDate: string
  /** `expense` | `income`. */
  kind: string
  /** `pending` | `paid`. */
  status: string
  recurrence: string
  companyId: string | null
}

/** Resolve nome de projeto/empresa para o subtítulo. */
export type NameLookup = (id: string | null | undefined) => string | null

const NO_NAME: NameLookup = () => null

export type ProjectionContext = {
  projectName?: NameLookup
  companyName?: NameLookup
}

export type Window = { from: string; to: string }

function inWindow(date: string | null | undefined, window: Window): date is string {
  return !!date && date >= window.from && date <= window.to
}

// ── Tarefa ──────────────────────────────────────────────────────────────────

/**
 * Uma tarefa pode render até DOIS itens: o agendamento e o follow-up. Cada data
 * é testada separadamente — um follow-up dentro da janela não deve arrastar
 * junto um agendamento de fora dela.
 */
export function taskToAgendaItems(
  task: TaskSource,
  window: Window,
  ctx: ProjectionContext = {},
): AgendaItem[] {
  const projectName = ctx.projectName ?? NO_NAME
  const companyName = ctx.companyName ?? NO_NAME

  const base = {
    entityType: 'task' as const,
    entityId: task.id,
    entryId: null,
    title: task.title,
    done: task.done,
    // Projeto → empresa → delegado. Era resolvido em duplicidade dentro de
    // AgendaCalendar e AgendaTimeline, cada um com seu próprio lookup.
    subtitle:
      projectName(task.projectId) ?? companyName(task.companyId) ?? task.delegatePersonName ?? null,
    projectId: task.projectId,
    companyId: task.companyId,
    delegatePersonId: task.delegatePersonId,
    delegatePersonName: task.delegatePersonName,
    amountCents: null,
    recurring: false,
  }

  const out: AgendaItem[] = []

  if (inWindow(task.scheduledDate, window)) {
    const time = normalizeTime(task.scheduledTime)
    const { endDate, endTime } = blockEnd(task.scheduledDate, time, task.durationMinutes)
    out.push({
      ...base,
      id: task.id,
      kind: 'task',
      date: task.scheduledDate,
      time,
      endDate,
      endTime,
      shape: time ? 'block' : 'milestone',
      allDay: time === null,
      tone: task.type as AgendaTone,
    })
  }

  if (task.followupActive && inWindow(task.followupDate, window)) {
    // Follow-up nunca tem hora: é um lembrete de dia, não um compromisso. Era
    // por isso que ele sumia da grade semanal, que descartava todo item sem
    // hora por não ter faixa de "dia todo" onde colocá-lo.
    out.push({
      ...base,
      id: `${task.id}:followup`,
      kind: 'followup',
      date: task.followupDate,
      time: null,
      endDate: task.followupDate,
      endTime: null,
      shape: 'milestone',
      allDay: true,
      tone: 'fup',
    })
  }

  return out
}

// ── Meta ────────────────────────────────────────────────────────────────────

/** `null` quando a meta não tem prazo ou o prazo cai fora da janela. */
export function goalToAgendaItem(
  goal: GoalSource,
  window: Window,
  ctx: ProjectionContext = {},
): AgendaItem | null {
  if (!inWindow(goal.dueDate, window)) return null
  const companyName = ctx.companyName ?? NO_NAME
  return {
    id: goal.id,
    kind: 'goal',
    entityType: 'goal',
    entityId: goal.id,
    entryId: null,
    date: goal.dueDate,
    time: null,
    endDate: goal.dueDate,
    endTime: null,
    shape: 'milestone',
    allDay: true,
    recurring: false,
    title: goal.title,
    done: goal.done,
    tone: 'goal',
    subtitle: companyName(goal.companyId),
    projectId: null,
    companyId: goal.companyId,
    delegatePersonId: null,
    delegatePersonName: null,
    amountCents: null,
  }
}

// ── Pagamento ───────────────────────────────────────────────────────────────

/** `null` quando o vencimento cai fora da janela. */
export function paymentToAgendaItem(
  payment: PaymentSource,
  window: Window,
  ctx: ProjectionContext = {},
): AgendaItem | null {
  if (!inWindow(payment.dueDate, window)) return null
  const companyName = ctx.companyName ?? NO_NAME
  return {
    id: payment.id,
    kind: 'payment',
    entityType: 'payment',
    entityId: payment.id,
    entryId: null,
    date: payment.dueDate,
    time: null,
    endDate: payment.dueDate,
    endTime: null,
    shape: 'milestone',
    allDay: true,
    // A recorrência ainda é materializada em linhas-filho (uma só, e só ao
    // pagar). Vira ocorrência de verdade na Fase 4.
    recurring: payment.recurrence !== 'none',
    title: payment.description,
    done: payment.status === 'paid',
    tone: payment.kind === 'income' ? 'payment-in' : 'payment-out',
    subtitle: companyName(payment.companyId),
    projectId: null,
    companyId: payment.companyId,
    delegatePersonId: null,
    delegatePersonName: null,
    amountCents: payment.amountCents,
  }
}

// ── Projeção completa (o caminho do cliente) ────────────────────────────────

export type ProjectAgendaInput = Window &
  ProjectionContext & {
    /** Já sem arquivadas — quem chama filtra, porque cada lado tem seu campo. */
    tasks?: TaskSource[]
    goals?: GoalSource[]
    payments?: PaymentSource[]
    /** Ausente = todos os tipos. */
    kinds?: AgendaItemKind[]
  }

/**
 * Monta a agenda inteira a partir das listas em cache. É o caminho que pinta a
 * tela no primeiro frame, antes (e independentemente) da resposta da rede.
 */
export function projectAgenda(input: ProjectAgendaInput): AgendaItem[] {
  const window = { from: input.from, to: input.to }
  const ctx = { projectName: input.projectName, companyName: input.companyName }
  const wanted = input.kinds?.length ? new Set(input.kinds) : null
  const wants = (kind: AgendaItemKind) => !wanted || wanted.has(kind)

  const out: AgendaItem[] = []

  if (input.tasks?.length && (wants('task') || wants('followup'))) {
    for (const task of input.tasks) {
      for (const item of taskToAgendaItems(task, window, ctx)) {
        if (wants(item.kind)) out.push(item)
      }
    }
  }

  if (input.goals?.length && wants('goal')) {
    for (const goal of input.goals) {
      const item = goalToAgendaItem(goal, window, ctx)
      if (item) out.push(item)
    }
  }

  if (input.payments?.length && wants('payment')) {
    for (const payment of input.payments) {
      const item = paymentToAgendaItem(payment, window, ctx)
      if (item) out.push(item)
    }
  }

  return sortAgendaItems(out)
}

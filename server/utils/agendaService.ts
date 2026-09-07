import { and, eq, gte, inArray, lte, or } from 'drizzle-orm'
import { companies, goals, payments, people, projects, tasks } from '~~/server/db/schema'
import { taskFilter } from './accessFilter'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'
import type { AgendaItem, AgendaItemKind } from '~~/shared/agendaItem'
import { sortAgendaItems } from '~~/shared/agendaSort'
import {
  goalToAgendaItem,
  paymentToAgendaItem,
  taskToAgendaItems,
  type Window,
} from '~~/shared/agendaProject'
import { daysBetween } from '~~/shared/rrule'

/**
 * A agenda, multi-entidade.
 *
 * Antes este serviço só sabia de tarefas — e o cliente nem o chamava: a agenda
 * era derivada no browser a partir de `useTasks().list`, numa segunda projeção
 * que divergiu desta (ordenação de item sem hora, e dois campos a mais). Agora
 * a projeção mora em `shared/`, e servidor e cliente usam o MESMO código para
 * montar o item; o que difere é só de onde vêm as linhas.
 *
 * `goals.due_date` e `payments.due_date` já existiam e simplesmente não
 * apareciam na agenda. `projects` ainda não tem data nenhuma — entra na Fase 3,
 * junto da camada de agendamento.
 *
 * ─── Acesso ───
 * Não existe um filtro único: cada tipo carrega o seu. Tarefa passa por
 * `taskFilter` (dono + delegado + convidado + quadro compartilhado); meta e
 * pagamento são estritamente do dono, porque é o que essas tabelas suportam
 * hoje. Unificar isso é outro trabalho — e já existem TRÊS implementações da
 * ACL de tarefa no repo, então não se escreve uma quarta aqui.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Janela máxima. Acima disto a resposta deixa de ser uma agenda e vira um dump. */
export const MAX_WINDOW_DAYS = 400

/** Teto de itens. Atingi-lo devolve `truncated: true` em vez de mentir por omissão. */
export const MAX_ITEMS = 2000

export const AGENDA_KINDS: readonly AgendaItemKind[] = [
  'task',
  'followup',
  'goal',
  'project',
  'payment',
]

export type ListAgendaArgs = {
  userId: string
  from: string
  to: string
  /** Ausente = todos os tipos. */
  kinds?: AgendaItemKind[]
}

export type ListAgendaResult = {
  from: string
  to: string
  items: AgendaItem[]
  truncated: boolean
}

export async function listAgenda(db: Db, args: ListAgendaArgs): Promise<ListAgendaResult> {
  const { from, to } = assertWindow(args)
  const wanted = new Set<AgendaItemKind>(args.kinds?.length ? args.kinds : AGENDA_KINDS)

  const items: AgendaItem[] = []

  if (wanted.has('task') || wanted.has('followup')) {
    items.push(...(await collectTasks(db, { userId: args.userId, from, to, wanted })))
  }
  if (wanted.has('goal')) {
    items.push(...(await collectGoals(db, { userId: args.userId, from, to })))
  }
  if (wanted.has('payment')) {
    items.push(...(await collectPayments(db, { userId: args.userId, from, to })))
  }
  // `project` ainda não produz itens: `projects` não tem coluna de data. Entra
  // na Fase 3 com a camada de agendamento, sem mudar este contrato.

  const sorted = sortAgendaItems(items)
  const truncated = sorted.length > MAX_ITEMS
  return { from, to, items: truncated ? sorted.slice(0, MAX_ITEMS) : sorted, truncated }
}

function assertWindow(args: Pick<ListAgendaArgs, 'from' | 'to'>): { from: string; to: string } {
  if (!DATE_RE.test(args.from) || !DATE_RE.test(args.to)) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Datas devem estar no formato YYYY-MM-DD.')
  }
  if (args.from > args.to) {
    throw createApiError(ErrCode.BAD_REQUEST, 'from deve ser menor ou igual a to.')
  }
  if (daysBetween(args.from, args.to) > MAX_WINDOW_DAYS) {
    throw createApiError(
      ErrCode.BAD_REQUEST,
      `A janela da agenda não pode passar de ${MAX_WINDOW_DAYS} dias.`,
    )
  }
  return { from: args.from, to: args.to }
}

// ── Tarefas e follow-ups ────────────────────────────────────────────────────

async function collectTasks(
  db: Db,
  args: { userId: string; from: string; to: string; wanted: Set<AgendaItemKind> },
): Promise<AgendaItem[]> {
  const rows = await db
    .select({
      t: tasks,
      personName: people.name,
      projectName: projects.name,
      companyName: companies.name,
    })
    .from(tasks)
    .leftJoin(people, eq(people.id, tasks.delegatePersonId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(companies, eq(companies.id, tasks.companyId))
    .where(
      and(
        taskFilter(args.userId),
        eq(tasks.archived, false),
        or(
          and(gte(tasks.scheduledDate, args.from), lte(tasks.scheduledDate, args.to)),
          and(
            eq(tasks.followupActive, true),
            gte(tasks.followupDate, args.from),
            lte(tasks.followupDate, args.to),
          ),
        ),
      ),
    )

  // O SQL já traz o nome de projeto/empresa/pessoa junto da linha, então o
  // lookup do subtítulo é um acesso direto — o cliente é que precisa consultar
  // as listas que tem em cache.
  const window: Window = { from: args.from, to: args.to }
  const out: AgendaItem[] = []
  for (const r of rows) {
    const t = r.t
    const items = taskToAgendaItems(
      {
        id: t.id,
        title: t.title,
        type: t.type,
        done: t.done,
        scheduledDate: t.scheduledDate,
        scheduledTime: t.scheduledTime,
        durationMinutes: t.durationMinutes,
        followupActive: t.followupActive,
        followupDate: t.followupDate,
        projectId: t.projectId,
        companyId: t.companyId,
        delegatePersonId: t.delegatePersonId,
        delegatePersonName: r.personName,
      },
      window,
      { projectName: () => r.projectName, companyName: () => r.companyName },
    )
    for (const item of items) {
      if (args.wanted.has(item.kind)) out.push(item)
    }
  }
  return out
}

// ── Metas ───────────────────────────────────────────────────────────────────

async function collectGoals(
  db: Db,
  args: { userId: string; from: string; to: string },
): Promise<AgendaItem[]> {
  const rows = await db
    .select({ g: goals, companyName: companies.name })
    .from(goals)
    .leftJoin(companies, eq(companies.id, goals.companyId))
    .where(
      and(
        eq(goals.ownerUserId, args.userId),
        eq(goals.archived, false),
        gte(goals.dueDate, args.from),
        lte(goals.dueDate, args.to),
      ),
    )
  if (rows.length === 0) return []

  const completed = await completedGoalIds(
    db,
    args.userId,
    rows.map((r) => r.g.id),
  )

  const window: Window = { from: args.from, to: args.to }
  return rows.flatMap((r) => {
    const item = goalToAgendaItem(
      {
        id: r.g.id,
        title: r.g.title,
        dueDate: r.g.dueDate,
        companyId: r.g.companyId,
        done: completed.has(r.g.id),
      },
      window,
      { companyName: () => r.companyName },
    )
    return item ? [item] : []
  })
}

/**
 * Metas cujas ações estão todas concluídas.
 *
 * `goals` não tem coluna `done`: a conclusão é derivada do progresso agregado.
 * Sem isto, uma meta 100% concluída com prazo passado apareceria em vermelho de
 * "atrasada" na agenda.
 *
 * Espelha a regra que o cliente já aplica em `statusMetaFromProgresso`
 * (`app/stores/metas.ts`): concluída quando há pelo menos uma ação e todas
 * estão feitas, contando tarefas diretas MAIS as tarefas dos projetos
 * vinculados. `aggregateGoalProgress` calcula o mesmo, mas em quatro consultas
 * sobre TODAS as metas do usuário — caro demais para rodar a cada janela de
 * agenda, quando só interessam as poucas metas que caem nela.
 */
async function completedGoalIds(
  db: Db,
  userId: string,
  goalIds: string[],
): Promise<Set<string>> {
  const rows = await db
    .select({
      directGoalId: tasks.goalId,
      projectGoalId: projects.goalId,
      done: tasks.done,
    })
    .from(tasks)
    .leftJoin(projects, and(eq(projects.id, tasks.projectId), eq(projects.archived, false)))
    .where(
      and(
        eq(tasks.ownerUserId, userId),
        eq(tasks.archived, false),
        or(inArray(tasks.goalId, goalIds), inArray(projects.goalId, goalIds)),
      ),
    )

  const total = new Map<string, number>()
  const done = new Map<string, number>()
  for (const r of rows) {
    // `tasks_project_xor_goal_check` garante que só um dos dois está setado,
    // então não há risco de contar a mesma tarefa duas vezes.
    const goalId = r.directGoalId ?? r.projectGoalId
    if (!goalId) continue
    total.set(goalId, (total.get(goalId) ?? 0) + 1)
    if (r.done) done.set(goalId, (done.get(goalId) ?? 0) + 1)
  }

  const out = new Set<string>()
  for (const [goalId, count] of total) {
    if (count > 0 && (done.get(goalId) ?? 0) === count) out.add(goalId)
  }
  return out
}

// ── Pagamentos ──────────────────────────────────────────────────────────────

async function collectPayments(
  db: Db,
  args: { userId: string; from: string; to: string },
): Promise<AgendaItem[]> {
  const rows = await db
    .select({ p: payments, companyName: companies.name })
    .from(payments)
    .leftJoin(companies, eq(companies.id, payments.companyId))
    .where(
      and(
        eq(payments.ownerUserId, args.userId),
        eq(payments.archived, false),
        gte(payments.dueDate, args.from),
        lte(payments.dueDate, args.to),
      ),
    )

  const window: Window = { from: args.from, to: args.to }
  return rows.flatMap((r) => {
    const item = paymentToAgendaItem(
      {
        id: r.p.id,
        description: r.p.description,
        amountCents: r.p.amountCents,
        dueDate: r.p.dueDate,
        kind: r.p.kind,
        status: r.p.status,
        recurrence: r.p.recurrence,
        companyId: r.p.companyId,
      },
      window,
      { companyName: () => r.companyName },
    )
    return item ? [item] : []
  })
}

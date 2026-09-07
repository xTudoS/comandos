import { z } from 'zod'
import type { Db } from './db'
import type { LlmTool } from './llm/types'
import { createApiError, ErrCode } from './errors'
import {
  archiveTask,
  completeTask,
  createTask,
  getTask,
  listTasks,
  updateTask,
} from './tasksService'
import { listAgenda } from './agendaService'
import { listProjects } from './projectsService'
import { listGoals } from './goalsService'
import { listCompanies } from './companiesService'
import { listPeople } from './peopleService'
import { isOverdueOn, todayInOwnerTz } from './clock'

/**
 * O catálogo de ferramentas do Comando — declarado UMA vez, consumido por três
 * superfícies: o servidor MCP (`/api/mcp`), a página de prompt (`/comando`) e o
 * classificador de tarefas.
 *
 * ─── A regra que não pode ser quebrada ───
 * Todo executor chama os SERVIÇOS existentes (`tasksService`, `agendaService`,
 * …), nunca SQL cru. É isso que faz o ACL de `server/utils/accessFilter.ts`
 * (`taskFilter`) valer também aqui: um delegate não enxerga tarefa de outro
 * dono por meio de uma ferramenta, do mesmo jeito que não enxerga pela API.
 *
 * `scripts/ia.ts` faz o oposto — vai direto no Postgres, sem auth e sem
 * accessFilter — e por isso é dev-only. Ele serviu de INVENTÁRIO do que expor
 * aqui, não de implementação.
 *
 * Ferramentas de escrita também respeitam as invariantes de domínio, porque
 * elas moram nos serviços: o XOR `tasks_project_xor_goal_check` e a regra
 * "projeto/meta pessoal ⇒ lifeArea obrigatória".
 */

export type ToolContext = {
  db: Db
  userId: string
}

export type AiTool = {
  name: string
  description: string
  /** Schema zod: valida a entrada E gera o JSON Schema mandado ao modelo. */
  schema: z.ZodType
  /** Leitura pura. O MCP marca como readOnlyHint e o classificador só usa estas. */
  readOnly: boolean
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown>
}

const HORIZONS = ['core7', 'core30', 'core60', 'core90', 'hibernating'] as const
const TYPES = ['ceo', 'delegate', 'personal'] as const
const LIFE_AREAS = ['corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias'] as const
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')

/**
 * Projeção enxuta de tarefa.
 *
 * A linha crua tem 26 colunas e várias não dizem nada para um modelo
 * (`createdByUserId`, `lifeItemId`, timestamps). Mandar tudo é token gasto sem
 * retorno — e piora a resposta, porque enterra o que importa.
 */
function slimTask(t: {
  id: string
  title: string
  description: string
  horizon: string
  type: string
  isMicro: boolean
  done: boolean
  archived: boolean
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number | null
  followupActive: boolean
  followupDate: string | null
  projectId: string | null
  goalId: string | null
  companyId: string | null
  lifeArea: string | null
  delegatePersonName?: string | null
}) {
  return {
    id: t.id,
    title: t.title,
    description: t.description || undefined,
    horizon: t.horizon,
    type: t.type,
    isMicro: t.isMicro,
    done: t.done,
    archived: t.archived,
    scheduledDate: t.scheduledDate ?? undefined,
    scheduledTime: t.scheduledTime ? String(t.scheduledTime).slice(0, 5) : undefined,
    durationMinutes: t.durationMinutes ?? undefined,
    followupDate: t.followupActive ? (t.followupDate ?? undefined) : undefined,
    projectId: t.projectId ?? undefined,
    goalId: t.goalId ?? undefined,
    companyId: t.companyId ?? undefined,
    lifeArea: t.lifeArea ?? undefined,
    delegate: t.delegatePersonName ?? undefined,
  }
}

/** Vencimento efetivo — mesma regra do cliente (`app/utils/overdue.ts`). */
function dueOf(t: {
  scheduledDate: string | null
  followupActive: boolean
  followupDate: string | null
}): string | null {
  return t.scheduledDate ?? (t.followupActive ? t.followupDate : null) ?? null
}

export const AI_TOOLS: AiTool[] = [
  // ── Leitura ───────────────────────────────────────────────────────────────
  {
    name: 'list_tasks',
    description:
      'Lista as tarefas do usuário, com filtros opcionais. Use para responder ' +
      '"o que está pendente", "o que atrasou", "o que é de hoje". Devolve no ' +
      'máximo `limit` tarefas (padrão 50).',
    readOnly: true,
    schema: z.object({
      horizon: z.enum(HORIZONS).optional().describe('Horizonte de tempo.'),
      type: z.enum(TYPES).optional().describe('ceo = você faz; delegate = delegada; personal = pessoal.'),
      done: z.boolean().optional().describe('Concluídas (true) ou abertas (false).'),
      isMicro: z.boolean().optional().describe('Apenas ações rápidas (até ~30 min).'),
      overdue: z.boolean().optional().describe('Apenas vencidas e não concluídas.'),
      scheduledFrom: DATE.optional(),
      scheduledTo: DATE.optional(),
      search: z.string().optional().describe('Texto no título ou na descrição.'),
      includeArchived: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    async run(ctx, input) {
      const a = input as {
        horizon?: string
        type?: string
        done?: boolean
        isMicro?: boolean
        overdue?: boolean
        scheduledFrom?: string
        scheduledTo?: string
        search?: string
        includeArchived?: boolean
        limit?: number
      }
      const all = await listTasks(ctx.db, {
        userId: ctx.userId,
        includeArchived: a.includeArchived ?? false,
      })
      const today = todayInOwnerTz()
      const needle = a.search?.toLowerCase()

      const filtered = all.filter((t) => {
        if (a.horizon && t.horizon !== a.horizon) return false
        if (a.type && t.type !== a.type) return false
        if (a.done !== undefined && t.done !== a.done) return false
        if (a.isMicro !== undefined && t.isMicro !== a.isMicro) return false
        if (a.overdue && !isOverdueOn(dueOf(t), t.done, today)) return false
        if (a.scheduledFrom && (!t.scheduledDate || t.scheduledDate < a.scheduledFrom)) return false
        if (a.scheduledTo && (!t.scheduledDate || t.scheduledDate > a.scheduledTo)) return false
        if (needle) {
          const hay = `${t.title} ${t.description}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })

      return {
        total: filtered.length,
        tasks: filtered.slice(0, a.limit ?? 50).map(slimTask),
      }
    },
  },
  {
    name: 'get_task',
    description: 'Uma tarefa específica, com checklist, anotações e convidados.',
    readOnly: true,
    schema: z.object({ id: z.string().uuid() }),
    async run(ctx, input) {
      const task = await getTask(ctx.db, {
        userId: ctx.userId,
        taskId: (input as { id: string }).id,
      })
      if (!task) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
      return task
    },
  },
  {
    name: 'get_agenda',
    description:
      'A agenda entre duas datas: tarefas agendadas, follow-ups, metas com prazo ' +
      'e pagamentos a vencer, tudo numa lista só, ordenada. Janela máxima 400 dias.',
    readOnly: true,
    schema: z.object({
      from: DATE,
      to: DATE,
      kinds: z
        .array(z.enum(['task', 'followup', 'goal', 'project', 'payment']))
        .optional()
        .describe('Ausente = todos os tipos.'),
    }),
    async run(ctx, input) {
      const a = input as { from: string; to: string; kinds?: string[] }
      return await listAgenda(ctx.db, {
        userId: ctx.userId,
        from: a.from,
        to: a.to,
        ...(a.kinds?.length ? { kinds: a.kinds as never[] } : {}),
      })
    },
  },
  {
    name: 'get_stats',
    description:
      'Panorama: quantas tarefas por horizonte, por tipo, quantas atrasadas, ' +
      'micro e concluídas. Use antes de responder "como estou" ou "o que está rolando".',
    readOnly: true,
    schema: z.object({}),
    async run(ctx) {
      const all = await listTasks(ctx.db, { userId: ctx.userId })
      const today = todayInOwnerTz()
      const open = all.filter((t) => !t.done)
      const count = <T extends string>(items: readonly T[], of: (t: (typeof all)[number]) => T) =>
        Object.fromEntries(items.map((k) => [k, open.filter((t) => of(t) === k).length]))

      return {
        today,
        total: all.length,
        open: open.length,
        done: all.length - open.length,
        overdue: open.filter((t) => isOverdueOn(dueOf(t), t.done, today)).length,
        micro: open.filter((t) => t.isMicro).length,
        scheduled: open.filter((t) => t.scheduledDate).length,
        byHorizon: count(HORIZONS, (t) => t.horizon),
        byType: count(TYPES, (t) => t.type),
      }
    },
  },
  {
    name: 'list_context',
    description:
      'Projetos, metas, empresas e pessoas do usuário, com id e nome. Chame ANTES ' +
      'de criar ou editar tarefa que precise referenciar algum deles — os campos ' +
      'esperam id, não nome.',
    readOnly: true,
    schema: z.object({
      include: z
        .array(z.enum(['projects', 'goals', 'companies', 'people']))
        .optional()
        .describe('Ausente = todos.'),
    }),
    async run(ctx, input) {
      const want = new Set((input as { include?: string[] }).include ?? [
        'projects',
        'goals',
        'companies',
        'people',
      ])
      const out: Record<string, unknown> = {}
      if (want.has('projects')) {
        out.projects = (await listProjects(ctx.db, { userId: ctx.userId })).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          companyId: p.companyId ?? undefined,
        }))
      }
      if (want.has('goals')) {
        out.goals = (await listGoals(ctx.db, { userId: ctx.userId })).map((g) => ({
          id: g.id,
          title: g.title,
          dueDate: g.dueDate ?? undefined,
        }))
      }
      if (want.has('companies')) {
        out.companies = (await listCompanies(ctx.db, { ownerUserId: ctx.userId })).map((c) => ({
          id: c.id,
          name: c.name,
        }))
      }
      if (want.has('people')) {
        out.people = (await listPeople(ctx.db, { ownerUserId: ctx.userId })).map((p) => ({
          id: p.id,
          name: p.name,
          isAssistant: p.isAssistant,
        }))
      }
      return out
    },
  },

  // ── Escrita ───────────────────────────────────────────────────────────────
  {
    name: 'create_task',
    description:
      'Cria uma tarefa. Só informe campos de que você tem certeza — o padrão ' +
      '(horizonte core30, tipo ceo) é melhor que um palpite errado. ' +
      'projectId e goalId são mutuamente exclusivos.',
    readOnly: false,
    schema: z.object({
      title: z.string().min(1).max(500),
      description: z.string().max(10_000).optional(),
      horizon: z.enum(HORIZONS).optional(),
      type: z.enum(TYPES).optional(),
      isMicro: z.boolean().optional(),
      scheduledDate: DATE.optional(),
      scheduledTime: TIME.optional(),
      durationMinutes: z.number().int().min(1).optional(),
      projectId: z.string().uuid().optional(),
      goalId: z.string().uuid().optional(),
      companyId: z.string().uuid().optional(),
      lifeArea: z.enum(LIFE_AREAS).optional(),
      delegatePersonId: z.string().uuid().optional(),
    }),
    async run(ctx, input) {
      const task = await createTask(ctx.db, {
        userId: ctx.userId,
        input: input as { title: string },
      })
      return slimTask(task as never)
    },
  },
  {
    name: 'update_task',
    description:
      'Edita uma tarefa existente. Mande APENAS os campos que mudam. ' +
      'null limpa o campo.',
    readOnly: false,
    schema: z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(10_000).optional(),
      horizon: z.enum(HORIZONS).optional(),
      isMicro: z.boolean().optional(),
      scheduledDate: DATE.nullable().optional(),
      scheduledTime: TIME.nullable().optional(),
      durationMinutes: z.number().int().min(1).nullable().optional(),
      projectId: z.string().uuid().nullable().optional(),
      goalId: z.string().uuid().nullable().optional(),
      companyId: z.string().uuid().nullable().optional(),
      lifeArea: z.enum(LIFE_AREAS).nullable().optional(),
    }),
    async run(ctx, input) {
      const { id, ...patch } = input as { id: string }
      const task = await updateTask(ctx.db, {
        userId: ctx.userId,
        taskId: id,
        patch: patch as Record<string, never>,
      })
      return slimTask(task as never)
    },
  },
  {
    name: 'complete_task',
    description: 'Marca como concluída, ou reabre com done=false.',
    readOnly: false,
    schema: z.object({ id: z.string().uuid(), done: z.boolean().optional() }),
    async run(ctx, input) {
      const a = input as { id: string; done?: boolean }
      const task = await completeTask(ctx.db, {
        userId: ctx.userId,
        taskId: a.id,
        done: a.done ?? true,
      })
      return slimTask(task as never)
    },
  },
  {
    name: 'archive_task',
    description:
      'Arquiva (ou desarquiva com archived=false). Arquivar é o "apagar" seguro: ' +
      'a tarefa sai das listas mas continua em /arquivo. Nunca há exclusão ' +
      'definitiva por aqui.',
    readOnly: false,
    schema: z.object({ id: z.string().uuid(), archived: z.boolean().optional() }),
    async run(ctx, input) {
      const a = input as { id: string; archived?: boolean }
      const task = await archiveTask(ctx.db, {
        userId: ctx.userId,
        taskId: a.id,
        archived: a.archived ?? true,
      })
      return slimTask(task as never)
    },
  },
]

export const AI_TOOLS_BY_NAME = new Map(AI_TOOLS.map((t) => [t.name, t]))

/** Só as de leitura — o que uma sessão sem permissão de escrita enxerga. */
export const AI_TOOLS_READONLY = AI_TOOLS.filter((t) => t.readOnly)

/**
 * JSON Schema para o modelo. `z.toJSONSchema` é do zod 4 — sem dependência
 * extra, e o schema fica derivado do MESMO objeto que valida a entrada, então
 * não há como os dois divergirem.
 */
export function toolToJsonSchema(tool: AiTool): LlmTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.schema, { io: 'input' }) as Record<string, unknown>,
  }
}

export function toolsForLlm(tools: AiTool[] = AI_TOOLS): LlmTool[] {
  return tools.map(toolToJsonSchema)
}

/**
 * Executa uma ferramenta pelo nome, validando a entrada antes.
 *
 * A validação é o portão: o modelo é uma fonte não confiável de argumentos, e
 * `run` recebe `Record<string, unknown>` vindo direto dele. Sem o parse do zod,
 * um uuid inventado chegaria como string qualquer no serviço.
 */
export async function runAiTool(
  ctx: ToolContext,
  call: { name: string; input: Record<string, unknown> },
  allowed: AiTool[] = AI_TOOLS,
): Promise<unknown> {
  const tool = allowed.find((t) => t.name === call.name)
  if (!tool) {
    throw createApiError(ErrCode.BAD_REQUEST, `Ferramenta desconhecida: ${call.name}`)
  }
  const parsed = tool.schema.safeParse(call.input ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createApiError(
      ErrCode.BAD_REQUEST,
      `Argumentos inválidos para ${call.name}: ${issue?.path.join('.') || '(raiz)'} — ${issue?.message}`,
    )
  }
  return await tool.run(ctx, parsed.data as Record<string, unknown>)
}

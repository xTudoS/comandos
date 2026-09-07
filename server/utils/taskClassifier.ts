import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { taskSuggestions } from '~~/server/db/schema'
import { getTask } from './tasksService'
import { listProjects } from './projectsService'
import { listGoals } from './goalsService'
import { listCompanies } from './companiesService'
import { listPeople } from './peopleService'
import type { ResolvedLlm } from './llm'
import { todayInOwnerTz } from './clock'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

/**
 * Classificador de campos de tarefa (item 9 da planning).
 *
 * ─── A invariante que manda aqui ───
 * Isto NUNCA entra no caminho de criação da tarefa. A tarefa nasce com id
 * gerado no cliente, vai para a outbox (`app/lib/offlineQueue.ts`) e o servidor
 * honra esse id; a captura rápida precisa continuar instantânea e funcionar
 * offline. Por isso o classificador é um endpoint SEPARADO, chamado depois que
 * o create liquida. Offline, simplesmente não roda — e não faz falta.
 *
 * ─── Sugerir, nunca preencher ───
 * A saída é uma sugestão que o usuário aceita ou descarta. Campo errado
 * preenchido sozinho é pior que campo vazio: o vazio a pessoa percebe, o errado
 * ela só descobre quando confia nele.
 *
 * Quando a confiança é baixa, o modelo PERGUNTA em vez de chutar — é o
 * "na dúvida ela pode perguntar" do pedido.
 */

const HORIZONS = ['core7', 'core30', 'core60', 'core90', 'hibernating'] as const
const TYPES = ['ceo', 'delegate', 'personal'] as const
const LIFE_AREAS = ['corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias'] as const

/**
 * O que aceitamos de volta do modelo.
 *
 * Tudo opcional de propósito: um modelo que só tem certeza do horizonte deve
 * poder mandar só o horizonte. `.catch(undefined)` em cada enum descarta valor
 * inventado sem derrubar a resposta inteira.
 */
const suggestionSchema = z.object({
  fields: z
    .object({
      horizon: z.enum(HORIZONS).catch(undefined as never).optional(),
      type: z.enum(TYPES).catch(undefined as never).optional(),
      isMicro: z.boolean().optional(),
      lifeArea: z.enum(LIFE_AREAS).catch(undefined as never).optional(),
      companyId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
      goalId: z.string().uuid().optional(),
      delegatePersonId: z.string().uuid().optional(),
      scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      durationMinutes: z.number().int().min(1).max(1440).optional(),
    })
    .default({}),
  questions: z
    .array(
      z.object({
        field: z.string().max(40),
        question: z.string().max(240),
        options: z.array(z.string().max(80)).max(5).default([]),
      }),
    )
    .max(3)
    .default([]),
  reasoning: z.string().max(400).optional(),
})

export type TaskSuggestion = z.infer<typeof suggestionSchema>

const SYSTEM = `Você classifica tarefas no Comando, um app pessoal de gestão em português do Brasil.

Devolva SOMENTE um objeto JSON, sem cercas de código e sem texto em volta.

Campos possíveis em "fields" (todos OPCIONAIS — omita o que você não sabe):
- horizon: core7 | core30 | core60 | core90 | hibernating
  Quando a tarefa precisa acontecer. core7 = próxima semana; hibernating = sem
  operador, parada. Na dúvida, omita: o padrão do app (core30) é razoável.
- type: ceo | delegate | personal
  ceo = só o dono faz; delegate = vai para outra pessoa; personal = não é trabalho.
- isMicro: true quando a tarefa se resolve em ~30 minutos ou menos.
- lifeArea: corpo | mente | relacionamentos | recursos | experiencias
  Só quando a tarefa é claramente de vida pessoal.
- companyId / projectId / goalId / delegatePersonId: use APENAS ids exatos da
  lista de contexto fornecida. NUNCA invente um id, e nunca mande um nome aqui.
- scheduledDate (YYYY-MM-DD) / scheduledTime (HH:MM) / durationMinutes:
  só quando o título disser a data ou a hora ("reunião terça 14h").

REGRAS DURAS:
- projectId e goalId são mutuamente exclusivos. Nunca mande os dois.
- Prefira omitir a chutar. Um campo errado é pior que um campo vazio.
- Se um campo importante é ambíguo, NÃO adivinhe: coloque uma pergunta em
  "questions" (no máximo 3), com opções curtas quando fizer sentido.

Formato:
{"fields":{...},"questions":[{"field":"type","question":"...","options":["..."]}],"reasoning":"uma frase"}`

/** Contexto real do usuário, para o modelo referenciar ids que existem. */
async function buildContext(db: Db, userId: string): Promise<string> {
  const [projects, goals, companies, people] = await Promise.all([
    listProjects(db, { userId }),
    listGoals(db, { userId }),
    listCompanies(db, { ownerUserId: userId }),
    listPeople(db, { ownerUserId: userId }),
  ])

  // Teto por lista: quem tem 300 projetos não pode estourar o prompt (e o
  // custo) numa chamada que roda a cada tarefa criada.
  const cap = <T>(xs: T[]) => xs.slice(0, 40)
  return JSON.stringify({
    hoje: todayInOwnerTz(),
    empresas: cap(companies).map((c) => ({ id: c.id, nome: c.name })),
    projetos: cap(projects).map((p) => ({ id: p.id, nome: p.name, categoria: p.category })),
    metas: cap(goals).map((g) => ({ id: g.id, titulo: g.title })),
    pessoas: cap(people).map((p) => ({ id: p.id, nome: p.name, assistente: p.isAssistant })),
  })
}

/** Modelos adoram embrulhar JSON em ```json. Desembrulha antes de parsear. */
function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('A resposta do modelo não continha JSON.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

/**
 * Descarta ids que não pertencem ao usuário.
 *
 * O modelo é fonte não confiável: ele pode devolver um uuid bem-formado que
 * veio de outro contexto (ou que ele simplesmente inventou). Sem esta peneira,
 * a sugestão poderia oferecer o vínculo com um projeto alheio, e aceitá-la
 * estouraria uma FK — ou pior, vincularia algo que não é do usuário.
 */
function pruneUnknownIds(
  fields: TaskSuggestion['fields'],
  known: { projects: Set<string>; goals: Set<string>; companies: Set<string>; people: Set<string> },
): TaskSuggestion['fields'] {
  const out = { ...fields }
  if (out.projectId && !known.projects.has(out.projectId)) delete out.projectId
  if (out.goalId && !known.goals.has(out.goalId)) delete out.goalId
  if (out.companyId && !known.companies.has(out.companyId)) delete out.companyId
  if (out.delegatePersonId && !known.people.has(out.delegatePersonId)) delete out.delegatePersonId
  // A restrição do banco (`tasks_project_xor_goal_check`) é a autoridade; aqui
  // só evitamos oferecer uma sugestão que o INSERT recusaria.
  if (out.projectId && out.goalId) delete out.goalId
  return out
}

export async function classifyTask(
  llm: ResolvedLlm,
  db: Db,
  args: { userId: string; taskId: string },
): Promise<TaskSuggestion> {
  // `getTask` já aplica o ACL — um usuário não classifica tarefa alheia.
  const task = await getTask(db, { userId: args.userId, taskId: args.taskId })

  const [projects, goals, companies, people] = await Promise.all([
    listProjects(db, { userId: args.userId }),
    listGoals(db, { userId: args.userId }),
    listCompanies(db, { ownerUserId: args.userId }),
    listPeople(db, { ownerUserId: args.userId }),
  ])
  const context = await buildContext(db, args.userId)

  const result = await llm.adapter.complete(
    {
      system: SYSTEM,
      maxTokens: 700,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content:
            `Contexto do usuário:\n${context}\n\n` +
            `Tarefa a classificar:\n` +
            `Título: ${task.title}\n` +
            (task.description ? `Descrição: ${task.description}\n` : '') +
          `\nClassifique.`,
        },
      ],
    },
    { apiKey: llm.apiKey, model: llm.model },
  )

  const parsed = suggestionSchema.safeParse(extractJson(result.text))
  if (!parsed.success) {
    throw createApiError(ErrCode.INTERNAL, 'Não foi possível interpretar a sugestão da IA.')
  }

  return {
    ...parsed.data,
    fields: pruneUnknownIds(parsed.data.fields, {
      projects: new Set(projects.map((p) => p.id)),
      goals: new Set(goals.map((g) => g.id)),
      companies: new Set(companies.map((c) => c.id)),
      people: new Set(people.map((p) => p.id)),
    }),
  }
}

/** Grava a sugestão, substituindo qualquer pendente da mesma tarefa. */
export async function saveSuggestion(
  db: Db,
  args: { taskId: string; suggestion: TaskSuggestion },
) {
  await db
    .delete(taskSuggestions)
    .where(and(eq(taskSuggestions.taskId, args.taskId), isNull(taskSuggestions.appliedAt)))
  const [row] = await db
    .insert(taskSuggestions)
    .values({ taskId: args.taskId, payload: args.suggestion })
    .returning()
  return row
}

/** A sugestão viva da tarefa: nem aplicada, nem descartada. */
export async function pendingSuggestion(db: Db, taskId: string) {
  const [row] = await db
    .select()
    .from(taskSuggestions)
    .where(
      and(
        eq(taskSuggestions.taskId, taskId),
        isNull(taskSuggestions.appliedAt),
        isNull(taskSuggestions.dismissedAt),
      ),
    )
    .orderBy(desc(taskSuggestions.createdAt))
    .limit(1)
  return row ?? null
}

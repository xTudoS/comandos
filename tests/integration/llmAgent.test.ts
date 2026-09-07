import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  resolveLlmFromConfig,
  runAgentLoop,
  type LlmRuntimeConfig,
} from '~~/server/utils/llm'
import { AI_TOOLS, runAiTool, toolsForLlm } from '~~/server/utils/aiTools'
import { classifyTask } from '~~/server/utils/taskClassifier'
import { createTask } from '~~/server/utils/tasksService'
import { useTestDb, seedUser } from './helpers'

/**
 * Exercita a camada de LLM inteira sem chave de verdade.
 *
 * O truque é o `NUXT_OPENAI_BASE_URL`: o adaptador OpenAI aponta para um
 * servidor local que responde no formato da Chat Completions. Com isso dá para
 * fechar o laço de ponta a ponta — modelo pede ferramenta → o catálogo executa
 * de verdade contra o Postgres → o resultado volta → o modelo responde — que é
 * justamente a parte que mais tem como quebrar em silêncio.
 */

let server: Server
let baseUrl: string
/** Cada teste instala o roteiro que quer que o "modelo" siga. */
let handler: (payload: Record<string, never>) => Record<string, unknown>
/** Corpos recebidos, para conferir o que foi realmente enviado ao provedor. */
let received: Record<string, never>[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const payload = JSON.parse(body || '{}')
      received.push(payload)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(handler(payload)))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  baseUrl = `http://127.0.0.1:${port}/v1`
  process.env.NUXT_OPENAI_BASE_URL = baseUrl
})

afterAll(async () => {
  delete process.env.NUXT_OPENAI_BASE_URL
  await new Promise<void>((r) => server.close(() => r()))
})

const CFG: LlmRuntimeConfig = { llmProvider: 'openai', openaiApiKey: 'sk-test' }

/** Resposta da OpenAI só com texto. */
function text(content: string) {
  return { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }
}

/** Resposta pedindo uma ferramenta. */
function callTool(name: string, args: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  }
}

describe('resolveLlmFromConfig', () => {
  it('escolhe o provedor declarado', () => {
    const llm = resolveLlmFromConfig({ llmProvider: 'google', googleAiApiKey: 'k' })
    expect(llm.adapter.provider).toBe('google')
    expect(llm.model).toBe('gemini-2.0-flash')
  })

  it('sem provedor declarado, usa o primeiro que tiver chave', () => {
    expect(resolveLlmFromConfig({ openaiApiKey: 'k' }).adapter.provider).toBe('openai')
    // Anthropic ganha quando as duas existem — é a ordem documentada.
    expect(
      resolveLlmFromConfig({ openaiApiKey: 'k', anthropicApiKey: 'k2' }).adapter.provider,
    ).toBe('anthropic')
  })

  it('modelo configurado sobrescreve o padrão', () => {
    expect(resolveLlmFromConfig({ anthropicApiKey: 'k', llmModel: 'claude-opus-5' }).model).toBe(
      'claude-opus-5',
    )
  })

  it('erra com mensagem acionável quando falta configuração', () => {
    expect(() => resolveLlmFromConfig({})).toThrow(/Nenhum provedor de IA configurado/)
    expect(() => resolveLlmFromConfig({ llmProvider: 'openai' })).toThrow(
      /NUXT_OPENAI_API_KEY não está definida/,
    )
    expect(() => resolveLlmFromConfig({ llmProvider: 'gpt5', openaiApiKey: 'k' })).toThrow(
      /inválido/,
    )
  })
})

describe('runAgentLoop — o laço de ferramentas', () => {
  it('🔁 pede ferramenta, executa DE VERDADE e responde com o resultado', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, { userId: alice, input: { title: 'Aberta' } })
      await createTask(db, {
        userId: alice,
        input: { title: 'Atrasada', scheduledDate: '2020-01-01' },
      })

      received = []
      handler = (payload) => {
        const msgs = (payload as { messages: { role: string; content: string }[] }).messages
        const toolMsg = [...msgs].reverse().find((m) => m.role === 'tool')
        if (!toolMsg) return callTool('get_stats', {})
        const stats = JSON.parse(toolMsg.content)
        return text(`Você tem ${stats.open} abertas e ${stats.overdue} atrasada.`)
      }

      const out = await runAgentLoop(resolveLlmFromConfig(CFG), {
        system: 'teste',
        messages: [{ role: 'user', content: 'como estou?' }],
        tools: toolsForLlm(),
        runTool: (call) => runAiTool({ db, userId: alice }, call, AI_TOOLS),
      })

      // Os números vieram do Postgres, atravessaram o adaptador e voltaram.
      expect(out.text).toBe('Você tem 2 abertas e 1 atrasada.')
      expect(out.steps).toHaveLength(1)
      expect(out.steps[0]!.toolName).toBe('get_stats')
      expect(out.truncated).toBe(false)
      // Duas idas ao provedor: o pedido e a conclusão.
      expect(received).toHaveLength(2)
      // As ferramentas foram mesmo declaradas no formato da OpenAI.
      expect((received[0] as { tools: { function: { name: string } }[] }).tools[0]!.function.name).toBe(
        'list_tasks',
      )
    } finally {
      await pool.end()
    }
  })

  it('escrita pelo laço chega no banco', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      let pediu = false
      handler = () => {
        if (!pediu) {
          pediu = true
          return callTool('create_task', { title: 'Criada pelo agente', horizon: 'core7' })
        }
        return text('Criei.')
      }

      const out = await runAgentLoop(resolveLlmFromConfig(CFG), {
        system: 'teste',
        messages: [{ role: 'user', content: 'cria uma tarefa' }],
        tools: toolsForLlm(),
        runTool: (call) => runAiTool({ db, userId: alice }, call, AI_TOOLS),
      })

      expect(out.text).toBe('Criei.')
      const lista = (await runAiTool({ db, userId: alice }, {
        name: 'list_tasks',
        input: {},
      })) as { tasks: { title: string }[] }
      expect(lista.tasks.map((t) => t.title)).toContain('Criada pelo agente')
    } finally {
      await pool.end()
    }
  })

  it('erro de ferramenta VOLTA para o modelo em vez de derrubar a conversa', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      let primeira = true
      handler = () => {
        if (primeira) {
          primeira = false
          // Id inventado — o caso clássico de alucinação.
          return callTool('get_task', { id: '00000000-0000-4000-8000-000000000000' })
        }
        return text('Não achei essa tarefa.')
      }

      const out = await runAgentLoop(resolveLlmFromConfig(CFG), {
        system: 'teste',
        messages: [{ role: 'user', content: 'abre a tarefa X' }],
        tools: toolsForLlm(),
        runTool: (call) => runAiTool({ db, userId: alice }, call, AI_TOOLS),
      })

      expect(out.text).toBe('Não achei essa tarefa.')
      expect(out.steps[0]!.error).toMatch(/não encontrada/i)
    } finally {
      await pool.end()
    }
  })

  it('corta em maxTurns quando o modelo entra em ciclo', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      // Pede a mesma ferramenta para sempre — o cenário que o teto existe para conter.
      handler = () => callTool('get_stats', {})

      const out = await runAgentLoop(resolveLlmFromConfig(CFG), {
        system: 'teste',
        messages: [{ role: 'user', content: 'loop' }],
        tools: toolsForLlm(),
        runTool: (call) => runAiTool({ db, userId: alice }, call, AI_TOOLS),
        maxTurns: 3,
      })

      expect(out.truncated).toBe(true)
      expect(out.steps).toHaveLength(3)
    } finally {
      await pool.end()
    }
  })
})

describe('classifyTask', () => {
  it('sugere campos e descarta ids que não são do usuário', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const task = await createTask(db, {
        userId: alice,
        input: { title: 'Ligar pro dentista amanhã' },
      })

      handler = () =>
        text(
          // Com cerca de markdown de propósito: modelos fazem isso o tempo todo.
          '```json\n' +
            JSON.stringify({
              fields: {
                type: 'personal',
                horizon: 'core7',
                isMicro: true,
                lifeArea: 'corpo',
                // Id bem-formado que NÃO existe para este usuário.
                projectId: '11111111-1111-4111-8111-111111111111',
              },
              questions: [
                { field: 'scheduledDate', question: 'Que dia exatamente?', options: [] },
              ],
              reasoning: 'Consulta pessoal, rápida.',
            }) +
            '\n```',
        )

      const out = await classifyTask(resolveLlmFromConfig(CFG), db, {
        userId: alice,
        taskId: task.id,
      })

      expect(out.fields.type).toBe('personal')
      expect(out.fields.isMicro).toBe(true)
      expect(out.fields.lifeArea).toBe('corpo')
      // 🔒 O id alheio/inventado foi peneirado — aceitar a sugestão não pode
      // vincular a tarefa a algo que não é do usuário.
      expect(out.fields.projectId).toBeUndefined()
      expect(out.questions[0]!.field).toBe('scheduledDate')
    } finally {
      await pool.end()
    }
  })

  it('nunca sugere projeto e meta ao mesmo tempo (XOR do banco)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const task = await createTask(db, { userId: alice, input: { title: 'X' } })
      handler = () =>
        text(
          JSON.stringify({
            fields: {
              projectId: '11111111-1111-4111-8111-111111111111',
              goalId: '22222222-2222-4222-8222-222222222222',
            },
          }),
        )
      const out = await classifyTask(resolveLlmFromConfig(CFG), db, {
        userId: alice,
        taskId: task.id,
      })
      expect(out.fields.projectId && out.fields.goalId).toBeFalsy()
    } finally {
      await pool.end()
    }
  })

  it('resposta sem JSON não passa por engano', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const task = await createTask(db, { userId: alice, input: { title: 'X' } })
      handler = () => text('Desculpe, não consigo ajudar com isso.')
      await expect(
        classifyTask(resolveLlmFromConfig(CFG), db, { userId: alice, taskId: task.id }),
      ).rejects.toThrow(/JSON/i)
    } finally {
      await pool.end()
    }
  })
})

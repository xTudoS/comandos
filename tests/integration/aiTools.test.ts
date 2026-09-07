import { describe, it, expect } from 'vitest'
import {
  AI_TOOLS,
  AI_TOOLS_READONLY,
  runAiTool,
  toolsForLlm,
  type ToolContext,
} from '~~/server/utils/aiTools'
import { createTask } from '~~/server/utils/tasksService'
import { useTestDb, seedUser } from './helpers'

/**
 * O catálogo de ferramentas é a superfície que o MCP, a página de prompt e o
 * classificador compartilham. O que estes testes travam é o que não pode
 * regredir em silêncio: o ACL, a validação de argumentos e o schema mandado ao
 * modelo. Nada aqui chama LLM — o catálogo roda sozinho.
 */
describe('aiTools — schema e catálogo', () => {
  it('toda ferramenta vira JSON Schema válido para o modelo', () => {
    const tools = toolsForLlm()
    expect(tools).toHaveLength(AI_TOOLS.length)
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z_]+$/)
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.parameters).toMatchObject({ type: 'object' })
    }
  })

  it('nomes de ferramenta são únicos', () => {
    const names = AI_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('o conjunto somente-leitura não contém nenhuma ferramenta de escrita', () => {
    expect(AI_TOOLS_READONLY.every((t) => t.readOnly)).toBe(true)
    const writes = AI_TOOLS.filter((t) => !t.readOnly).map((t) => t.name)
    expect(writes).toEqual(
      expect.arrayContaining(['create_task', 'update_task', 'complete_task', 'archive_task']),
    )
    for (const w of writes) {
      expect(AI_TOOLS_READONLY.find((t) => t.name === w)).toBeUndefined()
    }
  })
})

describe('aiTools — execução', () => {
  async function ctxFor(db: ToolContext['db'], userId: string): Promise<ToolContext> {
    return { db, userId }
  }

  it('ferramenta desconhecida é recusada', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await expect(
        runAiTool(await ctxFor(db, alice), { name: 'drop_database', input: {} }),
      ).rejects.toThrow(/desconhecida/i)
    } finally {
      await pool.end()
    }
  })

  it('argumento inválido é barrado ANTES de chegar no serviço', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const ctx = await ctxFor(db, alice)
      // O modelo é fonte não confiável: "amanhã" não é uma data.
      await expect(
        runAiTool(ctx, { name: 'get_task', input: { id: 'nao-e-uuid' } }),
      ).rejects.toThrow(/inválidos/i)
      await expect(
        runAiTool(ctx, {
          name: 'create_task',
          input: { title: 'X', scheduledDate: 'amanhã' },
        }),
      ).rejects.toThrow(/YYYY-MM-DD/)
    } finally {
      await pool.end()
    }
  })

  it('restringir a lista de permitidas bloqueia escrita', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await expect(
        runAiTool(
          await ctxFor(db, alice),
          { name: 'create_task', input: { title: 'Não deveria criar' } },
          AI_TOOLS_READONLY,
        ),
      ).rejects.toThrow(/desconhecida/i)
    } finally {
      await pool.end()
    }
  })

  it('🔒 ACL: um usuário NÃO enxerga tarefa de outro dono por ferramenta', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const daAlice = await createTask(db, {
        userId: alice,
        input: { title: 'Segredo da Alice' },
      })

      // Listar com o contexto do Bob não pode trazer nada da Alice.
      const lista = (await runAiTool(await ctxFor(db, bob), {
        name: 'list_tasks',
        input: {},
      })) as { total: number; tasks: { id: string }[] }
      expect(lista.tasks.find((t) => t.id === daAlice.id)).toBeUndefined()

      // E buscar pelo id direto também não — é o caminho que um modelo tentaria
      // se o id vazasse por qualquer outro canal.
      await expect(
        runAiTool(await ctxFor(db, bob), { name: 'get_task', input: { id: daAlice.id } }),
      ).rejects.toThrow(/não encontrada/i)

      // Nem escrever.
      await expect(
        runAiTool(await ctxFor(db, bob), {
          name: 'archive_task',
          input: { id: daAlice.id },
        }),
      ).rejects.toThrow(/não encontrada/i)
    } finally {
      await pool.end()
    }
  })

  it('list_tasks filtra por horizonte, tipo e busca', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const ctx = await ctxFor(db, alice)
      await createTask(db, { userId: alice, input: { title: 'Ligar pro cliente', horizon: 'core7' } })
      await createTask(db, { userId: alice, input: { title: 'Planejar trimestre', horizon: 'core90' } })

      const core7 = (await runAiTool(ctx, {
        name: 'list_tasks',
        input: { horizon: 'core7' },
      })) as { total: number }
      expect(core7.total).toBe(1)

      const busca = (await runAiTool(ctx, {
        name: 'list_tasks',
        input: { search: 'cliente' },
      })) as { tasks: { title: string }[] }
      expect(busca.tasks).toHaveLength(1)
      expect(busca.tasks[0]!.title).toBe('Ligar pro cliente')
    } finally {
      await pool.end()
    }
  })

  it('list_tasks --overdue usa a mesma regra de atraso do cliente', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const ctx = await ctxFor(db, alice)
      await createTask(db, {
        userId: alice,
        input: { title: 'Venceu', scheduledDate: '2020-01-01' },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'Vence em 2030', scheduledDate: '2030-01-01' },
      })
      const concluida = await createTask(db, {
        userId: alice,
        input: { title: 'Venceu mas foi feita', scheduledDate: '2020-01-01' },
      })
      await runAiTool(ctx, { name: 'complete_task', input: { id: concluida.id } })

      const out = (await runAiTool(ctx, {
        name: 'list_tasks',
        input: { overdue: true },
      })) as { tasks: { title: string }[] }
      // Concluída não conta como atrasada, mesmo com data vencida.
      expect(out.tasks.map((t) => t.title)).toEqual(['Venceu'])
    } finally {
      await pool.end()
    }
  })

  it('create_task → update_task → complete_task → archive_task, o ciclo completo', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const ctx = await ctxFor(db, alice)

      const criada = (await runAiTool(ctx, {
        name: 'create_task',
        input: { title: 'Tarefa via ferramenta', horizon: 'core7', isMicro: true },
      })) as { id: string; horizon: string; isMicro: boolean; done: boolean }
      expect(criada.horizon).toBe('core7')
      expect(criada.isMicro).toBe(true)

      const editada = (await runAiTool(ctx, {
        name: 'update_task',
        input: { id: criada.id, scheduledDate: '2030-03-01', scheduledTime: '09:00' },
      })) as { scheduledDate?: string; scheduledTime?: string }
      expect(editada.scheduledDate).toBe('2030-03-01')
      // A projeção corta os segundos que o Postgres devolve no `time`.
      expect(editada.scheduledTime).toBe('09:00')

      const feita = (await runAiTool(ctx, {
        name: 'complete_task',
        input: { id: criada.id },
      })) as { done: boolean }
      expect(feita.done).toBe(true)

      const arquivada = (await runAiTool(ctx, {
        name: 'archive_task',
        input: { id: criada.id },
      })) as { archived: boolean }
      expect(arquivada.archived).toBe(true)

      // Arquivada some da listagem padrão, mas continua existindo.
      const lista = (await runAiTool(ctx, { name: 'list_tasks', input: {} })) as { total: number }
      expect(lista.total).toBe(0)
      const comArquivadas = (await runAiTool(ctx, {
        name: 'list_tasks',
        input: { includeArchived: true },
      })) as { total: number }
      expect(comArquivadas.total).toBe(1)
    } finally {
      await pool.end()
    }
  })

  it('get_stats conta abertas, atrasadas e por horizonte', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const ctx = await ctxFor(db, alice)
      await createTask(db, { userId: alice, input: { title: 'A', horizon: 'core7' } })
      await createTask(db, {
        userId: alice,
        input: { title: 'B', horizon: 'core30', scheduledDate: '2020-01-01' },
      })

      const stats = (await runAiTool(ctx, { name: 'get_stats', input: {} })) as {
        open: number
        overdue: number
        byHorizon: Record<string, number>
      }
      expect(stats.open).toBe(2)
      expect(stats.overdue).toBe(1)
      expect(stats.byHorizon.core7).toBe(1)
      expect(stats.byHorizon.core30).toBe(1)
    } finally {
      await pool.end()
    }
  })

  it('list_context devolve id e nome para o modelo referenciar', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const out = (await runAiTool(await ctxFor(db, alice), {
        name: 'list_context',
        input: { include: ['companies', 'people'] },
      })) as Record<string, unknown[]>
      expect(Object.keys(out).sort()).toEqual(['companies', 'people'])
    } finally {
      await pool.end()
    }
  })
})

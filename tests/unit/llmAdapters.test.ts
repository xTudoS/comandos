import { describe, it, expect, vi, afterEach } from 'vitest'
import { anthropicAdapter } from '~~/server/utils/llm/anthropic'
import { googleAdapter } from '~~/server/utils/llm/google'
import { openaiAdapter } from '~~/server/utils/llm/openai'
import { LlmError, type LlmMessage } from '~~/server/utils/llm/types'

/**
 * Tradução de mensagens por provedor.
 *
 * É o código mais fácil de quebrar em silêncio de toda a camada de IA: cada API
 * representa resultado de ferramenta de um jeito diferente, e um erro aqui não
 * aparece como exceção — aparece como o modelo respondendo sem enxergar o que a
 * ferramenta devolveu. Estes testes travam o formato do corpo enviado.
 */

/** Captura o corpo do POST e devolve a resposta combinada. */
function stubFetch(response: unknown, status = 200) {
  const spy = vi.fn(async (_url: string, init: { body: string }) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
    _body: JSON.parse(init.body),
  }))
  vi.stubGlobal('fetch', spy)
  return spy
}

/** Conversa com uma ida e volta de ferramenta — o caso que expõe as diferenças. */
const CONVERSA: LlmMessage[] = [
  { role: 'user', content: 'quantas tarefas?' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [{ id: 'call_1', name: 'get_stats', input: {} }],
  },
  { role: 'tool', toolCallId: 'call_1', name: 'get_stats', content: '{"open":3}' },
]

afterEach(() => vi.unstubAllGlobals())

describe('anthropic', () => {
  it('manda tool_result como bloco dentro de uma mensagem de USER', async () => {
    const spy = stubFetch({
      content: [{ type: 'text', text: 'Três.' }],
      stop_reason: 'end_turn',
    })
    const out = await anthropicAdapter.complete(
      { messages: CONVERSA, system: 'sys' },
      { apiKey: 'k', model: 'claude-sonnet-5' },
    )

    const body = JSON.parse(spy.mock.calls[0]![1].body)
    // `system` é campo próprio, não mensagem.
    expect(body.system).toBe('sys')
    expect(body.messages).toHaveLength(3)
    expect(body.messages[1]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call_1', name: 'get_stats' }],
    })
    // A diferença que mais pega: resultado NÃO tem papel próprio.
    expect(body.messages[2]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call_1' }],
    })
    expect(out.text).toBe('Três.')
    expect(out.stopReason).toBe('stop')
  })

  it('agrupa DOIS resultados na mesma mensagem de user', async () => {
    const spy = stubFetch({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })
    await anthropicAdapter.complete(
      {
        messages: [
          { role: 'user', content: 'oi' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              { id: 'a', name: 'get_stats', input: {} },
              { id: 'b', name: 'list_tasks', input: {} },
            ],
          },
          { role: 'tool', toolCallId: 'a', name: 'get_stats', content: '{}' },
          { role: 'tool', toolCallId: 'b', name: 'list_tasks', content: '[]' },
        ],
      },
      { apiKey: 'k', model: 'm' },
    )

    const body = JSON.parse(spy.mock.calls[0]![1].body)
    // Duas mensagens separadas de tool_result fariam a API recusar.
    expect(body.messages).toHaveLength(3)
    expect(body.messages[2].content).toHaveLength(2)
  })

  it('lê tool_use e usa input_schema no formato da Anthropic', async () => {
    const spy = stubFetch({
      content: [{ type: 'tool_use', id: 'x', name: 'get_stats', input: { a: 1 } }],
      stop_reason: 'tool_use',
    })
    const out = await anthropicAdapter.complete(
      {
        messages: [{ role: 'user', content: 'oi' }],
        tools: [{ name: 'get_stats', description: 'd', parameters: { type: 'object' } }],
      },
      { apiKey: 'k', model: 'm' },
    )
    const body = JSON.parse(spy.mock.calls[0]![1].body)
    expect(body.tools[0]).toMatchObject({ name: 'get_stats', input_schema: { type: 'object' } })
    expect(out.stopReason).toBe('tool_use')
    expect(out.toolCalls[0]).toMatchObject({ id: 'x', name: 'get_stats', input: { a: 1 } })
  })

  it('erro HTTP vira LlmError com o status preservado', async () => {
    stubFetch({ error: 'overloaded' }, 529)
    await expect(
      anthropicAdapter.complete({ messages: [{ role: 'user', content: 'x' }] }, { apiKey: 'k', model: 'm' }),
    ).rejects.toMatchObject({ name: 'LlmError', provider: 'anthropic', status: 529 })
  })
})

describe('google', () => {
  it('usa o papel "model" e manda functionResponse como OBJETO', async () => {
    const spy = stubFetch({
      candidates: [{ content: { parts: [{ text: 'Três.' }] }, finishReason: 'STOP' }],
    })
    await googleAdapter.complete(
      { messages: CONVERSA, system: 'sys' },
      { apiKey: 'k', model: 'gemini-2.0-flash' },
    )

    const body = JSON.parse(spy.mock.calls[0]![1].body)
    expect(body.systemInstruction).toMatchObject({ parts: [{ text: 'sys' }] })
    // 'model', não 'assistant'.
    expect(body.contents[1].role).toBe('model')
    expect(body.contents[1].parts[0]).toMatchObject({ functionCall: { name: 'get_stats' } })
    // `response` PRECISA ser objeto — o JSON da ferramenta é parseado, não
    // repassado como string.
    expect(body.contents[2].parts[0].functionResponse.response).toEqual({ open: 3 })
  })

  it('envelopa resultado não-objeto em { result }', async () => {
    const spy = stubFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
    await googleAdapter.complete(
      {
        messages: [
          { role: 'user', content: 'oi' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 't', input: {} }] },
          { role: 'tool', toolCallId: 'a', name: 't', content: 'texto puro' },
        ],
      },
      { apiKey: 'k', model: 'm' },
    )
    const body = JSON.parse(spy.mock.calls[0]![1].body)
    expect(body.contents[2].parts[0].functionResponse.response).toEqual({ result: 'texto puro' })
  })

  it('functionCall vira tool_use mesmo com finishReason STOP', async () => {
    stubFetch({
      candidates: [
        {
          content: { parts: [{ functionCall: { name: 'get_stats', args: {} } }] },
          // O Gemini devolve STOP mesmo quando pediu função.
          finishReason: 'STOP',
        },
      ],
    })
    const out = await googleAdapter.complete(
      { messages: [{ role: 'user', content: 'x' }] },
      { apiKey: 'k', model: 'm' },
    )
    expect(out.stopReason).toBe('tool_use')
    expect(out.toolCalls[0]!.name).toBe('get_stats')
    // Id sintético, já que o Gemini não emite um.
    expect(out.toolCalls[0]!.id).toBeTruthy()
  })
})

describe('openai', () => {
  it('system vira mensagem e argumentos viajam como string JSON', async () => {
    const spy = stubFetch({
      choices: [{ message: { content: 'Três.' }, finish_reason: 'stop' }],
    })
    await openaiAdapter.complete(
      { messages: CONVERSA, system: 'sys' },
      { apiKey: 'k', model: 'gpt-4o' },
    )
    const body = JSON.parse(spy.mock.calls[0]![1].body)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(body.messages[2].tool_calls[0].function.arguments).toBe('{}')
    // Resultado TEM papel próprio aqui.
    expect(body.messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' })
  })

  it('argumento com JSON quebrado não derruba o adaptador', async () => {
    stubFetch({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'x', type: 'function', function: { name: 't', arguments: '{quebrado' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    })
    const out = await openaiAdapter.complete(
      { messages: [{ role: 'user', content: 'x' }] },
      { apiKey: 'k', model: 'm' },
    )
    // Vira objeto vazio; a validação zod do catálogo é quem recusa depois.
    expect(out.toolCalls[0]!.input).toEqual({})
  })
})

describe('LlmError', () => {
  it('carrega provedor e status', () => {
    const e = new LlmError('x', 'google', 429)
    expect(e.provider).toBe('google')
    expect(e.status).toBe(429)
  })
})

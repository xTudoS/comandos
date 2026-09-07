import {
  LlmError,
  type LlmAdapter,
  type LlmMessage,
  type LlmRequest,
  type LlmResult,
  type LlmToolCall,
} from './types'

/**
 * Adaptador da Messages API da Anthropic.
 *
 * Por `fetch` puro, sem SDK — mesma escolha de `server/utils/mailer.ts`. O
 * bundle do Worker é o argumento: o SDK traria dependências que nada aqui usa.
 */

const API = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

/**
 * Mensagens no formato da Anthropic.
 *
 * A diferença que mais pega: resultado de ferramenta NÃO é um papel próprio —
 * vai como bloco `tool_result` dentro de uma mensagem de `user`. E blocos
 * consecutivos de resultado precisam ser agrupados na MESMA mensagem, senão a
 * API recusa quando o modelo pediu duas ferramentas de uma vez.
 */
function toAnthropicMessages(messages: LlmMessage[]) {
  const out: { role: 'user' | 'assistant'; content: unknown }[] = []

  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
      continue
    }

    if (m.role === 'assistant') {
      const blocks: ContentBlock[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      }
      // Um assistant sem texto e sem ferramenta não existe para a API.
      if (blocks.length) out.push({ role: 'assistant', content: blocks })
      continue
    }

    // role === 'tool' — anexa ao último `user` de resultados, ou abre um novo.
    const block = {
      type: 'tool_result' as const,
      tool_use_id: m.toolCallId,
      content: m.content,
    }
    const last = out[out.length - 1]
    const lastIsToolResults =
      last?.role === 'user' &&
      Array.isArray(last.content) &&
      (last.content as { type?: string }[])[0]?.type === 'tool_result'

    if (lastIsToolResults) {
      ;(last!.content as unknown[]).push(block)
    } else {
      out.push({ role: 'user', content: [block] })
    }
  }

  return out
}

export const anthropicAdapter: LlmAdapter = {
  provider: 'anthropic',
  // Família Claude 5 — melhor equilíbrio custo/qualidade para este uso.
  defaultModel: 'claude-sonnet-5',

  async complete(req: LlmRequest, cfg): Promise<LlmResult> {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': cfg.apiKey,
        'anthropic-version': VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: req.maxTokens ?? 2048,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.system ? { system: req.system } : {}),
        messages: toAnthropicMessages(req.messages),
        ...(req.tools?.length
          ? {
              tools: req.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
            }
          : {}),
      }),
    })

    if (!res.ok) {
      throw new LlmError(
        `Anthropic respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`,
        'anthropic',
        res.status,
      )
    }

    const data = (await res.json()) as {
      content?: ContentBlock[]
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    let text = ''
    const toolCalls: LlmToolCall[] = []
    for (const block of data.content ?? []) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input ?? {} })
      }
    }

    return {
      text,
      toolCalls,
      stopReason:
        data.stop_reason === 'tool_use'
          ? 'tool_use'
          : data.stop_reason === 'max_tokens'
            ? 'length'
            : data.stop_reason === 'end_turn' || data.stop_reason === 'stop_sequence'
              ? 'stop'
              : 'other',
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      provider: 'anthropic',
      model: cfg.model,
    }
  },
}

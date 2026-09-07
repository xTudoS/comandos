import {
  LlmError,
  type LlmAdapter,
  type LlmMessage,
  type LlmRequest,
  type LlmResult,
  type LlmToolCall,
} from './types'

/**
 * Adaptador da Chat Completions da OpenAI.
 *
 * Chat Completions (e não a Responses API) porque é o formato que praticamente
 * todo provedor compatível-com-OpenAI implementa — Groq, Together, OpenRouter,
 * Ollama. Trocar `NUXT_OPENAI_BASE_URL` faz este mesmo adaptador atender todos
 * eles, sem código novo.
 */

const DEFAULT_BASE = 'https://api.openai.com/v1'

type ToolCallPayload = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/**
 * Diferenças que importam em relação à Anthropic:
 *  - resultado de ferramenta tem papel próprio (`tool`), com `tool_call_id`;
 *  - `system` é a primeira mensagem do array, não um campo separado;
 *  - os argumentos da ferramenta viajam como STRING JSON, não como objeto.
 */
function toOpenAiMessages(req: LlmRequest) {
  const out: Record<string, unknown>[] = []
  if (req.system) out.push({ role: 'system', content: req.system })

  for (const m of req.messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
              })),
            }
          : {}),
      })
    } else {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
    }
  }
  return out
}

/** Argumento vem como string; modelo alucinando JSON quebrado não pode derrubar o loop. */
function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export const openaiAdapter: LlmAdapter = {
  provider: 'openai',
  defaultModel: 'gpt-4o',

  async complete(req: LlmRequest, cfg): Promise<LlmResult> {
    const base = (process.env.NUXT_OPENAI_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_completion_tokens: req.maxTokens ?? 2048,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        messages: toOpenAiMessages(req),
        ...(req.tools?.length
          ? {
              tools: req.tools.map((t) => ({
                type: 'function',
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                },
              })),
            }
          : {}),
      }),
    })

    if (!res.ok) {
      throw new LlmError(
        `OpenAI respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`,
        'openai',
        res.status,
      )
    }

    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string | null; tool_calls?: ToolCallPayload[] }
        finish_reason?: string
      }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const choice = data.choices?.[0]
    const toolCalls: LlmToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: parseArgs(tc.function.arguments),
    }))

    return {
      text: choice?.message?.content ?? '',
      toolCalls,
      stopReason:
        choice?.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice?.finish_reason === 'length'
            ? 'length'
            : choice?.finish_reason === 'stop'
              ? 'stop'
              : 'other',
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
      provider: 'openai',
      model: cfg.model,
    }
  },
}

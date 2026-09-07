import {
  LlmError,
  type LlmAdapter,
  type LlmMessage,
  type LlmRequest,
  type LlmResult,
  type LlmToolCall,
} from './types'

/**
 * Adaptador do Gemini (Google AI / Generative Language API).
 *
 * É o mais distante dos três — vale conhecer as três diferenças antes de mexer:
 *  1. O papel do assistente chama `model`, não `assistant`.
 *  2. Não existe id de tool-call. O casamento pedido↔resposta é pelo NOME da
 *     função. Sintetizamos um id estável (`name:índice`) para honrar o contrato
 *     comum; na volta, só o nome é usado.
 *  3. `system` é um objeto próprio (`systemInstruction`), não uma mensagem.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

type Part =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

function toGoogleContents(messages: LlmMessage[]) {
  const out: { role: 'user' | 'model'; parts: Part[] }[] = []

  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', parts: [{ text: m.content }] })
      continue
    }

    if (m.role === 'assistant') {
      const parts: Part[] = []
      if (m.content) parts.push({ text: m.content })
      for (const tc of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: tc.input } })
      }
      if (parts.length) out.push({ role: 'model', parts })
      continue
    }

    // Resultado de ferramenta é `functionResponse` numa mensagem de `user`, e
    // `response` precisa ser OBJETO — string crua é recusada. Por isso o
    // envelope `{ result: ... }` quando o conteúdo não é um objeto JSON.
    let response: Record<string, unknown>
    try {
      const parsed = JSON.parse(m.content)
      response =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { result: parsed }
    } catch {
      response = { result: m.content }
    }

    const part: Part = { functionResponse: { name: m.name, response } }
    const last = out[out.length - 1]
    if (last?.role === 'user' && 'functionResponse' in (last.parts[0] ?? {})) {
      last.parts.push(part)
    } else {
      out.push({ role: 'user', parts: [part] })
    }
  }

  return out
}

export const googleAdapter: LlmAdapter = {
  provider: 'google',
  defaultModel: 'gemini-2.0-flash',

  async complete(req: LlmRequest, cfg): Promise<LlmResult> {
    const url = `${BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': cfg.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: toGoogleContents(req.messages),
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 2048,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
        ...(req.tools?.length
          ? {
              tools: [
                {
                  functionDeclarations: req.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                  })),
                },
              ],
            }
          : {}),
      }),
    })

    if (!res.ok) {
      throw new LlmError(
        `Google AI respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`,
        'google',
        res.status,
      )
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }

    const candidate = data.candidates?.[0]
    let text = ''
    const toolCalls: LlmToolCall[] = []
    for (const [i, part] of (candidate?.content?.parts ?? []).entries()) {
      if ('text' in part) text += part.text
      else if ('functionCall' in part) {
        toolCalls.push({
          // Id sintético: o Gemini não emite um, e o contrato comum pede.
          id: `${part.functionCall.name}:${i}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        })
      }
    }

    return {
      text,
      toolCalls,
      // O Gemini devolve STOP mesmo quando pediu função — quem decide é a
      // presença de functionCall, não o finishReason.
      stopReason: toolCalls.length
        ? 'tool_use'
        : candidate?.finishReason === 'MAX_TOKENS'
          ? 'length'
          : candidate?.finishReason === 'STOP'
            ? 'stop'
            : 'other',
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
      },
      provider: 'google',
      model: cfg.model,
    }
  },
}

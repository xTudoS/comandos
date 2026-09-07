/**
 * Contrato único de LLM do Comando — Anthropic, OpenAI e Google atrás da mesma
 * porta.
 *
 * O app fala SÓ estes tipos. Cada adaptador (`anthropic.ts`, `openai.ts`,
 * `google.ts`) traduz para o formato do seu provedor e volta. Assim o catálogo
 * de ferramentas, o classificador e a página de prompt são escritos uma vez, e
 * trocar de provedor é mudar uma variável de ambiente — não reescrever o
 * chamador.
 *
 * O denominador comum é deliberadamente pequeno: mensagens, ferramentas e
 * tool-calls. Nada de recurso exclusivo de um provedor vaza para cá.
 */

export type LlmProvider = 'anthropic' | 'openai' | 'google'

/** Uma chamada de ferramenta pedida pelo modelo. */
export type LlmToolCall = {
  /** Id do provedor, devolvido junto do resultado para casar pedido e resposta. */
  id: string
  name: string
  input: Record<string, unknown>
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[] }
  /** Resultado de UMA ferramenta, respondendo a `toolCallId`. */
  | { role: 'tool'; toolCallId: string; name: string; content: string }

/**
 * Definição de ferramenta. `parameters` é JSON Schema — os três provedores
 * aceitam JSON Schema, só divergem no nome do campo e no invólucro.
 */
export type LlmTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type LlmRequest = {
  system?: string
  messages: LlmMessage[]
  tools?: LlmTool[]
  maxTokens?: number
  temperature?: number
  /** Sobrescreve o modelo padrão do provedor. */
  model?: string
}

export type LlmResult = {
  /** Texto da resposta. Vazio quando o modelo só pediu ferramentas. */
  text: string
  toolCalls: LlmToolCall[]
  /** `tool_use` = quer rodar ferramenta e continuar; `stop` = terminou. */
  stopReason: 'stop' | 'tool_use' | 'length' | 'other'
  usage?: { inputTokens?: number; outputTokens?: number }
  provider: LlmProvider
  model: string
}

export type LlmAdapter = {
  provider: LlmProvider
  defaultModel: string
  complete(req: LlmRequest, cfg: { apiKey: string; model: string }): Promise<LlmResult>
}

/** Erro de provedor com status HTTP preservado, para o chamador decidir. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: LlmProvider,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

import type { H3Event } from 'h3'
import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'
import { googleAdapter } from './google'
import {
  LlmError,
  type LlmAdapter,
  type LlmMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmTool,
} from './types'

export * from './types'

const ADAPTERS: Record<LlmProvider, LlmAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
}

export type LlmRuntimeConfig = {
  llmProvider?: string
  llmModel?: string
  anthropicApiKey?: string
  openaiApiKey?: string
  googleAiApiKey?: string
}

/** Adaptador + chave + modelo já resolvidos. */
export type ResolvedLlm = {
  adapter: LlmAdapter
  apiKey: string
  model: string
}

function keyFor(provider: LlmProvider, cfg: LlmRuntimeConfig): string | undefined {
  if (provider === 'anthropic') return cfg.anthropicApiKey
  if (provider === 'openai') return cfg.openaiApiKey
  return cfg.googleAiApiKey
}

const ENV_NAME: Record<LlmProvider, string> = {
  anthropic: 'NUXT_ANTHROPIC_API_KEY',
  openai: 'NUXT_OPENAI_API_KEY',
  google: 'NUXT_GOOGLE_AI_API_KEY',
}

function isProvider(v: string): v is LlmProvider {
  return v === 'anthropic' || v === 'openai' || v === 'google'
}

/**
 * Resolve provedor + modelo + chave.
 *
 * `NUXT_LLM_PROVIDER` escolhe explicitamente. Sem ele, vale **a primeira chave
 * configurada**, na ordem anthropic → openai → google: quem só pôs uma chave
 * não deveria precisar declarar o óbvio numa segunda variável.
 */
export function resolveLlmFromConfig(cfg: LlmRuntimeConfig): ResolvedLlm {
  const declared = String(cfg.llmProvider || '').trim()
  let provider: LlmProvider | undefined
  if (declared) {
    if (!isProvider(declared)) {
      throw new Error(
        `NUXT_LLM_PROVIDER inválido: "${declared}". Use anthropic, openai ou google.`,
      )
    }
    provider = declared
  } else {
    provider = (['anthropic', 'openai', 'google'] as const).find((p) => keyFor(p, cfg))
  }

  if (!provider) {
    throw new Error(
      'Nenhum provedor de IA configurado. Defina uma das chaves: ' +
        `${ENV_NAME.anthropic}, ${ENV_NAME.openai} ou ${ENV_NAME.google}.`,
    )
  }

  const apiKey = keyFor(provider, cfg)
  if (!apiKey) {
    throw new Error(
      `NUXT_LLM_PROVIDER=${provider}, mas ${ENV_NAME[provider]} não está definida.`,
    )
  }

  const adapter = ADAPTERS[provider]
  // O modelo configurado só vale para o provedor a que pertence; senão trocar
  // de provedor levaria junto um id de modelo que o outro não conhece.
  const configured = String(cfg.llmModel || '').trim()
  const model = configured || adapter.defaultModel

  return { adapter, apiKey, model }
}

/**
 * Mesma resolução, lendo do runtimeConfig.
 *
 * Fica separada de `resolveLlmFromConfig` para o laço e os adaptadores serem
 * testáveis sem H3: `useRuntimeConfig` é auto-import do Nitro e não existe no
 * vitest, então qualquer coisa que o chamasse direto só rodaria dentro do app.
 */
export function resolveLlm(event: H3Event): ResolvedLlm {
  return resolveLlmFromConfig(useRuntimeConfig(event) as unknown as LlmRuntimeConfig)
}

/** Uma chamada, sem laço de ferramentas. */
export async function llmComplete(event: H3Event, req: LlmRequest): Promise<LlmResult> {
  const { adapter, apiKey, model } = resolveLlm(event)
  return await adapter.complete(req, { apiKey, model: req.model || model })
}

export type ToolRunner = (call: {
  name: string
  input: Record<string, unknown>
}) => Promise<unknown>

export type AgentStep = {
  toolName: string
  input: Record<string, unknown>
  output: unknown
  error?: string
}

export type AgentResult = {
  text: string
  steps: AgentStep[]
  provider: LlmProvider
  model: string
  /** true quando o laço bateu o teto sem o modelo concluir. */
  truncated: boolean
}

/**
 * O laço de ferramentas: pede ao modelo, roda o que ele pedir, devolve o
 * resultado e repete até ele parar de pedir.
 *
 * É o que faz o "agente que executa ações" existir, e é o mesmo laço usado pela
 * página de prompt — não há dois motores.
 *
 * `maxTurns` não é decoração: um modelo pode entrar em ciclo pedindo a mesma
 * ferramenta para sempre, e cada volta é uma chamada paga e um request preso.
 * O teto corta isso; `truncated` conta a verdade para quem chamou.
 */
export async function runAgentLoop(
  llm: ResolvedLlm,
  args: {
    system: string
    messages: LlmMessage[]
    tools: LlmTool[]
    runTool: ToolRunner
    maxTurns?: number
    maxTokens?: number
    onStep?: (step: AgentStep) => void | Promise<void>
  },
): Promise<AgentResult> {
  const { adapter, apiKey, model } = llm
  const maxTurns = args.maxTurns ?? 8
  const messages: LlmMessage[] = [...args.messages]
  const steps: AgentStep[] = []

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await adapter.complete(
      {
        system: args.system,
        messages,
        tools: args.tools,
        maxTokens: args.maxTokens,
      },
      { apiKey, model },
    )

    if (!result.toolCalls.length) {
      return {
        text: result.text,
        steps,
        provider: result.provider,
        model: result.model,
        truncated: false,
      }
    }

    messages.push({
      role: 'assistant',
      content: result.text,
      toolCalls: result.toolCalls,
    })

    for (const call of result.toolCalls) {
      const step: AgentStep = { toolName: call.name, input: call.input, output: null }
      try {
        step.output = await args.runTool(call)
      } catch (err) {
        // Erro de ferramenta VOLTA para o modelo em vez de estourar: pedir um
        // uuid que não existe é recuperável, e o modelo costuma corrigir
        // sozinho na volta seguinte. Estourar aqui perderia a conversa inteira.
        step.error = err instanceof Error ? err.message : String(err)
        step.output = { error: step.error }
      }
      steps.push(step)
      await args.onStep?.(step)
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(step.output ?? null),
      })
    }
  }

  return {
    text: '',
    steps,
    provider: adapter.provider,
    model,
    truncated: true,
  }
}

export { LlmError }

import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { AI_TOOLS, AI_TOOLS_READONLY, runAiTool, toolsForLlm } from '~~/server/utils/aiTools'
import { resolveLlm, runAgentLoop, type LlmMessage } from '~~/server/utils/llm'
import { todayInOwnerTz } from '~~/server/utils/clock'
import { createApiError, ErrCode } from '~~/server/utils/errors'

/**
 * O motor da página `/comando`.
 *
 * Roda o MESMO laço de ferramentas do agente (`runAgentLoop`) sobre o MESMO
 * catálogo do MCP (`aiTools.ts`). Não existe um segundo cérebro: a página de
 * prompt é uma interface para o que o MCP já expõe.
 *
 * Sem streaming token a token. O limite do Worker é de CPU, e esperar um fetch
 * não consome CPU — o custo real de não streamar é de percepção, e a UI cobre
 * isso mostrando as ferramentas conforme elas rodam, no retorno. Trocar isto
 * por SSE depois não muda nada do lado do servidor além deste handler.
 */

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(10_000),
      }),
    )
    .min(1)
    .max(40),
  /** false = o agente também pode criar e editar. Padrão: só leitura. */
  allowWrite: z.boolean().optional(),
})

function systemPrompt(userName: string, allowWrite: boolean): string {
  return `Você é o assistente do Comando, o app pessoal de gestão de ${userName}. Responda em português do Brasil.

O Comando organiza o trabalho em HORIZONTES DE TEMPO, não em prioridades:
- core7 (próximos 7 dias), core30, core60, core90, hibernating (parada, sem operador)
- "Micro" é uma flag ortogonal: ação de até ~30 min, em qualquer horizonte
- Tipos: ceo (só o dono faz), delegate (delegada), personal (não é trabalho)

Como trabalhar:
- SEMPRE consulte as ferramentas antes de responder sobre os dados. Nunca invente
  uma tarefa, uma data ou um número — se não chamou a ferramenta, você não sabe.
- Para responder "o que está rolando", comece por get_stats e complemente com
  list_tasks.
- Campos que apontam para projeto, meta, empresa ou pessoa esperam ID. Chame
  list_context antes de usá-los.
- Hoje é ${todayInOwnerTz()}.
${
  allowWrite
    ? `- Você PODE criar e editar tarefas. Antes de uma escrita que o usuário não
  pediu explicitamente, pergunte. Depois de escrever, diga em uma linha o que fez.
- Arquivar é o "apagar" seguro. Não existe exclusão definitiva por aqui.`
    : `- Esta sessão é SOMENTE LEITURA. Se o usuário pedir para criar ou mudar algo,
  explique que ele precisa ligar a escrita no seletor da página.`
}

Seja direto e curto. Liste tarefas com o título e a data, sem despejar JSON cru.`
}

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Mensagens inválidas.')

  const db = useDb(event)
  const allowWrite = body.data.allowWrite ?? false
  const allowed = allowWrite ? AI_TOOLS : AI_TOOLS_READONLY

  const messages: LlmMessage[] = body.data.messages.map((m) =>
    m.role === 'user'
      ? { role: 'user', content: m.content }
      : { role: 'assistant', content: m.content },
  )

  try {
    const result = await runAgentLoop(resolveLlm(event), {
      system: systemPrompt(user.name, allowWrite),
      messages,
      tools: toolsForLlm(allowed),
      // O ACL vive aqui: `runAiTool` valida os argumentos e chama os serviços,
      // que aplicam `taskFilter`. O modelo não fala com o banco.
      runTool: (call) => runAiTool({ db, userId: user.id }, call, allowed),
      maxTurns: 8,
      maxTokens: 1500,
    })

    return {
      text:
        result.text ||
        (result.truncated
          ? 'Precisei de passos demais e parei por segurança. Tente uma pergunta mais específica.'
          : ''),
      // A UI mostra o que foi consultado/alterado — é o que torna a resposta
      // auditável em vez de mágica.
      steps: result.steps.map((s) => ({
        tool: s.toolName,
        input: s.input,
        error: s.error,
      })),
      provider: result.provider,
      model: result.model,
      truncated: result.truncated,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Nenhum provedor de IA configurado') || msg.includes('não está definida')) {
      throw createApiError(ErrCode.INTERNAL, msg)
    }
    throw err
  }
})

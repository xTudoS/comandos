import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { classifyTask, saveSuggestion } from '~~/server/utils/taskClassifier'
import { resolveLlm } from '~~/server/utils/llm'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

/**
 * Sugere os campos de uma tarefa já criada.
 *
 * Endpoint SEPARADO do POST /api/tasks de propósito — ver o cabeçalho de
 * `server/utils/taskClassifier.ts`. O cliente chama isto DEPOIS que a criação
 * liquidou; offline a chamada simplesmente não acontece, e a tarefa segue
 * perfeitamente utilizável sem sugestão nenhuma.
 *
 * A sugestão é gravada para sobreviver a um reload, e devolvida na resposta
 * para a UI mostrar na hora.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')

  const db = useDb(event)

  let suggestion
  try {
    suggestion = await classifyTask(resolveLlm(event), db, {
      userId: user.id,
      taskId: id.data,
    })
  } catch (err) {
    // Sem provedor configurado é o caso comum em dev e numa instância que não
    // liga IA. Vale um 503 com a mensagem exata, e não um 500 anônimo: quem
    // chamou precisa saber que é configuração, não defeito.
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Nenhum provedor de IA configurado') || msg.includes('não está definida')) {
      throw createApiError(ErrCode.INTERNAL, msg)
    }
    throw err
  }

  await saveSuggestion(db, { taskId: id.data, suggestion })
  return suggestion
})

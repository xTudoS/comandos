import { useDb } from '~~/server/utils/db'
import { authenticateMcp } from '~~/server/utils/mcpTokenService'
import {
  AI_TOOLS,
  AI_TOOLS_READONLY,
  runAiTool,
  toolToJsonSchema,
  type AiTool,
} from '~~/server/utils/aiTools'

/**
 * Servidor MCP do Comando — JSON-RPC 2.0 sobre HTTP (transporte "Streamable
 * HTTP", modo sem sessão).
 *
 * É a leitura mais barata de "plugar o Claude no Comando": zero UI nova, e quem
 * paga o modelo é o cliente (Claude Code / Desktop), não o app. As mesmas
 * ferramentas de `aiTools.ts` que a página de prompt usa.
 *
 * Conexão:
 *   claude mcp add --transport http comando https://comandos.app/api/mcp \
 *     --header "Authorization: Bearer cmdo_..."
 *
 * Auth por Bearer, não por cookie: não há navegador nesse fluxo. O token sai de
 * /settings/mcp e carrega o escopo (só-leitura ou leitura e escrita).
 */

const PROTOCOL_VERSION = '2025-06-18'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
}

const ok = (id: JsonRpcId, result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: JsonRpcId, code: number, message: string) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
})

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as JsonRpcRequest | JsonRpcRequest[]

  // Lote é parte do JSON-RPC 2.0 e os clientes usam. Responder um objeto para
  // um array faria o cliente descartar tudo em silêncio.
  if (Array.isArray(body)) {
    const out = []
    for (const item of body) {
      const res = await handleOne(event, item)
      if (res) out.push(res)
    }
    return out.length ? out : null
  }

  return await handleOne(event, body)
})

async function handleOne(event: Parameters<typeof useDb>[0], req: JsonRpcRequest) {
  const id = req.id ?? null
  const method = req.method ?? ''

  // Notificação (sem `id`) não leva resposta — é regra do JSON-RPC, e devolver
  // algo aqui faz clientes estritos reclamarem.
  const isNotification = req.id === undefined

  try {
    // `initialize` e `ping` respondem SEM token: é o handshake, e o cliente
    // precisa conseguir descobrir o servidor antes de qualquer coisa. Tudo que
    // toca dados exige autenticação.
    if (method === 'initialize') {
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'comando', version: '1.0.0' },
      })
    }
    if (method === 'ping') return isNotification ? null : ok(id, {})
    if (method.startsWith('notifications/')) return null

    const db = useDb(event)
    const auth = await authenticateMcp(db, getRequestHeader(event, 'authorization'))
    const allowed: AiTool[] = auth.readOnly ? AI_TOOLS_READONLY : AI_TOOLS

    if (method === 'tools/list') {
      return ok(id, {
        tools: allowed.map((t) => {
          const schema = toolToJsonSchema(t)
          return {
            name: schema.name,
            description: schema.description,
            inputSchema: schema.parameters,
            annotations: { readOnlyHint: t.readOnly },
          }
        }),
      })
    }

    if (method === 'tools/call') {
      const name = String(req.params?.name ?? '')
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>
      try {
        const result = await runAiTool({ db, userId: auth.userId }, { name, input: args }, allowed)
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      } catch (err) {
        // Erro de FERRAMENTA volta como resultado com isError, não como erro
        // de protocolo: assim o modelo lê a mensagem e corrige a chamada, em
        // vez de a conversa inteira morrer. Erro de protocolo é outra coisa.
        return ok(id, {
          content: [{ type: 'text', text: messageOf(err) }],
          isError: true,
        })
      }
    }

    return fail(id, -32601, `Método não suportado: ${method}`)
  } catch (err) {
    // -32603 = internal error. Auth falhando cai aqui e vira erro de protocolo,
    // que é o certo: sem token não há sessão em que uma ferramenta pudesse rodar.
    return isNotification ? null : fail(id, -32603, messageOf(err))
  }
}

function messageOf(err: unknown): string {
  const data = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
  if (data) return data
  return err instanceof Error ? err.message : String(err)
}

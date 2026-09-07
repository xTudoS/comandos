import type { Pool } from 'pg'
import { useAuth } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { taskForBroadcast } from '~~/server/utils/tasksService'
import { boardAccessUserIds, boardsByTask } from '~~/server/utils/boardsService'

// Após uma mutação bem-sucedida em /api/<entity>, avisa o worker comando-sync
// (via service binding) para invalidar aquela entidade em tempo real. Best-effort:
// nunca quebra a resposta. Mutações sem service binding (ex.: dev) são ignoradas —
// o polling da Fase 1 continua sendo a rede de segurança.
//
// Destinatários (fan-out por sala-de-usuário):
//   - tasks: TODOS que têm acesso à tarefa (dono + delegado vinculado +
//     convidados vinculados), via taskForBroadcast().access — espelho do
//     taskFilter. Assim o dono vê a edição do delegado/convidado e vice-versa;
//     tarefa só-sua notifica só você.
//   - demais entidades: só-do-dono → o próprio mutador.
const ENTITY_BY_SEGMENT: Record<string, string> = {
  tasks: 'tasks',
  projects: 'projects',
  notes: 'notes',
  goals: 'goals',
  payments: 'payments',
  companies: 'companies',
  people: 'people',
  boards: 'boards',
}

type SyncBinding = { broadcast(userId: string, message: string): Promise<void> }

export default defineNitroPlugin((nitroApp) => {
  // event tipado como `any` (padrão do projeto, ver sessionGuard) — os tipos do
  // h3 estão defasados neste setup e não expõem method/path/node/context.
  nitroApp.hooks.hook('afterResponse', async (event: any, response: any) => {
    const cf = (
      event.context as {
        cloudflare?: {
          env?: { SYNC?: SyncBinding }
          context?: { waitUntil(p: Promise<unknown>): void }
        }
      }
    ).cloudflare
    const waitUntil = cf?.context?.waitUntil?.bind(cf.context)

    // Trabalho best-effort de broadcast. Pode ser um no-op (GET, sem service
    // binding, resposta 4xx, etc.). NUNCA estoura — o polling é a rede de segurança.
    const broadcastWork = (async () => {
      try {
        const method = (event.method || '').toUpperCase()
        if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT' && method !== 'DELETE') return

        const seg = (event.path || '').match(/^\/api\/([a-z]+)\b/)?.[1]
        const entity = seg && ENTITY_BY_SEGMENT[seg]
        if (!entity) return

        // Só propaga em sucesso (2xx/3xx).
        const status = event.node?.res?.statusCode ?? 200
        if (status >= 400) return

        const sync = cf?.env?.SYNC
        if (!sync) return

        // Resolve o userId direto pelo better-auth (sem os logs do sessionGuard).
        const session = await useAuth(event).api.getSession({ headers: toWebRequest(event).headers })
        const userId = session?.user?.id
        if (!userId) return

        // `origin` = id da aba que originou a mutação (header x-client-id). O próprio
        // originador ignora o eco no cliente, evitando refresh/flicker redundante.
        const origin = getRequestHeader(event, 'x-client-id') || undefined

        let targets = [userId]
        let message = JSON.stringify({ type: 'invalidate', entity, origin })
        // Quando a mensagem depende de QUEM recebe, o handler define este
        // builder e o envio passa a montar uma linha por destinatário.
        let messageFor: ((uid: string) => Promise<string>) | null = null

        if (entity === 'tasks') {
          // id pela URL (/api/tasks/<id>/…) ou pelo corpo da resposta (POST cria).
          const idFromUrl = (event.path || '').match(/^\/api\/tasks\/([^/?]+)/)?.[1]
          const body = response?.body as { id?: unknown } | undefined
          const taskId = idFromUrl || (typeof body?.id === 'string' ? body.id : undefined)

          if (method === 'DELETE' && taskId) {
            // Tarefa já removida: manda o id pro mutador remover. A outra parte
            // (dono/delegado) pega no poll/foco — não dá pra resolver o acesso
            // de uma linha que não existe mais.
            message = JSON.stringify({ type: 'remove', entity, id: taskId, origin })
          } else if (taskId) {
            // Payload-push: manda a tarefa ENRIQUECIDA pronta (sem o receptor
            // refazer GET) e só para quem tem acesso (dono + delegado +
            // convidados com conta).
            const db = useDb(event)
            const info = await taskForBroadcast(db, taskId)
            if (info) {
              targets = info.access
              // `boards` é o único campo por-usuário da linha: cada destinatário
              // enxerga um subconjunto dos quadros. Mandar os quadros do mutador
              // para todo mundo vazaria o nome de quadro alheio no card.
              messageFor = async (uid) => {
                const byTask = await boardsByTask(db, { userId: uid, taskIds: [taskId] })
                return JSON.stringify({
                  type: 'upsert',
                  entity,
                  data: { ...info.row, boards: byTask.get(taskId) ?? [] },
                  origin,
                })
              }
            }
          }
        }

        if (entity === 'boards') {
          // Toda mutação de quadro (colunas, cards, membros) chega em /api/boards/<id>/…
          // e interessa a TODOS que enxergam o quadro. Sem esse fan-out, o card
          // que um membro move não aparece para os outros até o poll.
          const boardId = (event.path || '').match(/^\/api\/boards\/([^/?]+)/)?.[1]
          if (boardId) {
            const access = await boardAccessUserIds(useDb(event), boardId)
            // Quadro recém-apagado não resolve acesso: fica só com o mutador.
            if (access.length) targets = access
          }
        }

        await Promise.all(
          targets.map(async (uid) =>
            sync.broadcast(uid, messageFor ? await messageFor(uid) : message),
          ),
        )
      } catch {
        // best-effort
      }
    })()

    // Fecha TODOS os pools pg abertos na requisição depois que o broadcast
    // terminou de usá-los. Encadear em `.then` evita a corrida: o broadcast (que
    // pode abrir o seu próprio pool via useDb) sempre roda antes do pool.end().
    // Sem este fechamento, o socket fica aberto e o runtime cancela a request
    // com "Worker hung".
    const cleanup = broadcastWork.then(() => {
      const pools = (event.context as { __dbPools?: Pool[] }).__dbPools ?? []
      return Promise.all(pools.map((p) => p.end().catch(() => {})))
    }).catch(() => {})

    if (waitUntil) waitUntil(cleanup)
    else await cleanup
  })
})

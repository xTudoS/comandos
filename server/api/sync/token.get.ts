import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { mintSyncToken } from '~~/server/utils/syncToken'

/**
 * Emite um token curto para o cliente abrir o WebSocket no worker comando-sync.
 * Exige sessão (mesma origem, com cookie). Se o tempo real não estiver
 * configurado neste ambiente (sem segredo ou sem URL — ex.: `nuxt dev` puro),
 * retorna token nulo e o cliente simplesmente não conecta (o polling da Fase 1
 * segue cobrindo as atualizações).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)

  const env = (event.context as { cloudflare?: { env?: { SYNC_TOKEN_SECRET?: string } } })
    .cloudflare?.env
  const url = (useRuntimeConfig().public.syncUrl as string) || ''
  const secret = env?.SYNC_TOKEN_SECRET

  if (!secret || !url) {
    return { token: null as string | null, url: '' }
  }

  const token = await mintSyncToken(secret, user.id)
  return { token, url }
})

import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { listMcpTokens } from '~~/server/utils/mcpTokenService'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  return { tokens: await listMcpTokens(useDb(event), user.id) }
})

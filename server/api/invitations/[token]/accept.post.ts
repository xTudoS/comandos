import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { acceptInvitation } from '~~/server/utils/invitationService'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { resolveClientIp } from '~~/server/utils/requestIp'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({ name: z.string().max(200).optional() })

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createApiError(ErrCode.BAD_REQUEST, 'Token ausente.')

  const body = bodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  // Per-IP rate limit on a public endpoint: the token itself is 32 bytes
  // of entropy, but cap brute-force attempts anyway so a leaked mailbox
  // can't be ground forever.
  const ip = resolveClientIp(event)
  if (ip) {
    await checkRateLimit(event, {
      key: `invite-accept:ip:${ip}`,
      limit: 30,
      windowSec: 60,
    })
  }

  const db = useDb(event)
  const result = await acceptInvitation(db, { rawToken: token, optionalName: body.data.name })
  return { ok: true as const, email: result.email }
})

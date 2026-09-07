import { z } from 'zod'
import { createHash } from 'node:crypto'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { decideApproval } from '~~/server/utils/approvalDecide'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { resolveClientIp } from '~~/server/utils/requestIp'
import { resolveRpId, resolveSiteOrigin } from '~~/server/utils/siteOrigin'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

const bodySchema = z.object({
  credentialId: z.string().min(1),
  decisionPayload: z.object({
    approval_id: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
    target_user_id: z.string().uuid(),
    requester_fingerprint: z.string(),
    requester_ua: z.string(),
    requester_ip: z.string().nullable(),
    decided_at: z.string(),
    nonce: z.string(),
  }),
  assertion: z.object({
    signature: z.string(),
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
  }),
})

export default defineEventHandler(async (event) => {
  const { user, session } = await requireAuthedUser(event)

  const approvalId = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!approvalId.success) throw createApiError(ErrCode.BAD_REQUEST, 'Id inválido.')

  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')

  await checkRateLimit(event, {
    key: `approval-decide:user:${user.id}`,
    limit: 20,
    windowSec: 60,
  })
  const ip = resolveClientIp(event)
  if (ip) {
    await checkRateLimit(event, {
      key: `approval-decide:ip:${ip}`,
      limit: 40,
      windowSec: 60,
    })
  }

  // Origin e rpID vêm do host DESTA request (validado contra a allowlist), não
  // de um siteUrl fixo: com o app servido tanto por comandos.app quanto pelo
  // workers.dev, um valor estático faz o rpIdHash divergir do que o
  // autenticador assinou e toda aprovação de dispositivo falha no outro host.
  const siteUrl = resolveSiteOrigin(event)
  const expectedRpIdHash = createHash('sha256').update(resolveRpId(event)).digest()

  const db = useDb(event)
  return await decideApproval(db, {
    approvalId: approvalId.data,
    decidingUser: { id: user.id },
    decidingSession: { id: session.id },
    credentialId: body.data.credentialId,
    decisionPayload: body.data.decisionPayload,
    assertion: body.data.assertion,
    expectedOrigin: siteUrl,
    expectedRpIdHash,
  })
})

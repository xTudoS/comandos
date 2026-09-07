import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { buildApprovalChallenge } from '~~/server/utils/approvalChallenge'
import { storeChallenge } from '~~/server/utils/challenges'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { resolveClientIp } from '~~/server/utils/requestIp'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({ decision: z.enum(['approve', 'reject']) })

const CHALLENGE_TTL_SEC = 120

// POST (not GET) on purpose: minting a challenge inserts into auth_challenges and
// must not be triggered by cross-origin simple-GET requests. Same-origin POST
// requires a preflight for JSON bodies, so CSRF surface is covered.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)

  const approvalId = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!approvalId.success) throw createApiError(ErrCode.BAD_REQUEST, 'Id inválido.')

  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Decisão inválida.')

  await checkRateLimit(event, {
    key: `approval-challenge:user:${user.id}`,
    limit: 30,
    windowSec: 60,
  })
  const ip = resolveClientIp(event)
  if (ip) {
    await checkRateLimit(event, {
      key: `approval-challenge:ip:${ip}`,
      limit: 60,
      windowSec: 60,
    })
  }

  const db = useDb(event)
  const result = await buildApprovalChallenge(db, {
    approvalId: approvalId.data,
    decidingUserId: user.id,
    decision: body.data.decision,
  })

  await storeChallenge(event, {
    challenge: result.challenge,
    payload: result.decisionPayload,
    purpose: 'device-approval',
    userId: user.id,
    ttlSec: CHALLENGE_TTL_SEC,
  })

  return result
})

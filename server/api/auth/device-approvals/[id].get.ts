import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { readFingerprint } from '~~/server/utils/deviceFingerprint'
import { pollApproval } from '~~/server/utils/approvalPoll'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { resolveClientIp } from '~~/server/utils/requestIp'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

// Poll endpoint for the REQUESTING device (the one waiting to be approved).
// Authorized by the device fingerprint cookie set during the OTP bootstrap
// rejection. Unknown/mismatched fingerprints get a uniform 404 so approval
// ids aren't enumerable. The fingerprint cookie is an unsigned weak signal —
// the rate limits below keep fingerprint theft from turning into an
// unbounded grind for the stolen onboarding token.
export default defineEventHandler(async (event) => {
  const approvalId = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!approvalId.success) throw createApiError(ErrCode.NOT_FOUND, 'Não encontrada.')

  const fingerprint = readFingerprint(event)
  if (fingerprint) {
    await checkRateLimit(event, {
      key: `approval-poll:fp:${fingerprint}`,
      limit: 120,
      windowSec: 60,
    })
  }
  const ip = resolveClientIp(event)
  if (ip) {
    await checkRateLimit(event, {
      key: `approval-poll:ip:${ip}`,
      limit: 240,
      windowSec: 60,
    })
  }

  const db = useDb(event)
  return await pollApproval(db, { approvalId: approvalId.data, fingerprint })
})

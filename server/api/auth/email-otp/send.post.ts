import { z } from 'zod'
import { useAuth } from '~~/server/utils/auth'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { resolveClientIp } from '~~/server/utils/requestIp'

const bodySchema = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event))
  const email = body.email.toLowerCase()
  const ip = resolveClientIp(event)

  await checkRateLimit(event, { key: `otp-send:email:${email}`, limit: 5, windowSec: 3600 })
  if (ip) {
    await checkRateLimit(event, { key: `otp-send:ip:${ip}`, limit: 20, windowSec: 3600 })
  }

  const auth = useAuth(event)
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
  return { success: true }
})

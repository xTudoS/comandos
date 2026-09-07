import { applyRateLimit } from '~~/server/utils/rateLimitRules'

export default defineEventHandler(async (event) => {
  // h3 v2 exposes the parsed URL on `event.url`; extracting pathname sidesteps
  // query-string noise in the match.
  const path = (event as { url?: URL }).url?.pathname ?? ''
  await applyRateLimit(event, path)
})

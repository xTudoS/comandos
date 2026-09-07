import { useAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const auth = useAuth(event)
  
  // In h3 2.x, `event.req` is already a Web `Request` — `toWebRequest` was
  // removed in the v1→v2 rewrite. better-auth's handler takes a Request.
  return auth.handler(toWebRequest(event))
})

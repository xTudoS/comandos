// Token curto (HMAC-SHA256) que autoriza o WebSocket no worker comando-sync.
//
// O Nuxt (já com sessão válida) emite em /api/sync/token; o comando-sync valida
// com o MESMO segredo (SYNC_TOKEN_SECRET). Como o browser não pode setar headers
// no WebSocket, o token vai na query (?t=) — por isso é de vida curta (60s) e só
// trafega sobre wss. Formato idêntico ao verifyToken do worker:
//   base64url(JSON {uid, exp}) + '.' + base64url(HMAC(secret, payload))

const TTL_MS = 60_000

export async function mintSyncToken(secret: string, userId: string): Promise<string> {
  const payload = b64urlEncode(JSON.stringify({ uid: userId, exp: Date.now() + TTL_MS }))
  const sig = await hmac(secret, payload)
  return `${payload}.${sig}`
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return b64urlBytes(new Uint8Array(sig))
}

function b64urlBytes(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlEncode(str: string): string {
  return b64urlBytes(new TextEncoder().encode(str))
}

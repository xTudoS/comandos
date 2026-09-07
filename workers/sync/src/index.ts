/**
 * comando-sync — Worker dedicado de tempo real (Fase 2).
 *
 * - `SyncRoom`: 1 Durable Object por usuário (`getByName(userId)`). Mantém os
 *   WebSockets via Hibernation API e faz broadcast de invalidações para todos
 *   os dispositivos daquele usuário.
 * - `SyncEntrypoint` (default export, WorkerEntrypoint):
 *     - `fetch` GET /ws?t=<token>  → valida o token e liga o WS na sala do user.
 *     - `broadcast(userId, entity)` → RPC chamado pelo Nuxt via service binding.
 *
 * O DO não guarda estado: `ctx.getWebSockets()` sobrevive à hibernação, então o
 * broadcast iniciado pelo servidor SEMPRE alcança os sockets vivos — diferente
 * do pub/sub do crossws, que depende de um Set em memória perdido ao hibernar.
 */
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'

interface Env {
  SYNC_ROOM: DurableObjectNamespace<SyncRoom>
  SYNC_TOKEN_SECRET: string
}

export class SyncRoom extends DurableObject<Env> {
  /** Liga um novo WebSocket à sala deste usuário (Hibernation API). */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    // acceptWebSocket (e não server.accept()) habilita hibernação: o DO pode
    // dormir com o socket aberto e acorda em mensagem/broadcast.
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** RPC: envia a mensagem (JSON já serializado) a todos os sockets deste usuário.
   *  O cliente que originou a mutação ignora pelo campo `origin` no payload. */
  broadcast(message: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message)
      } catch {
        // socket morto / condição de corrida — ignora
      }
    }
  }

  // ── Hibernation handlers ──
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // keep-alive: responde o ping do cliente sem manter o DO acordado à toa.
    if (message === 'ping') {
      try {
        ws.send('pong')
      } catch {
        // ignora
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code >= 1000 && code < 5000 ? code : 1000, 'bye')
    } catch {
      // ignora
    }
  }
}

export default class SyncEntrypoint extends WorkerEntrypoint<Env> {
  /** WebSocket público: GET /ws?t=<token>. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return new Response('ok')
    if (url.pathname !== '/ws') return new Response('not found', { status: 404 })
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }
    const token = url.searchParams.get('t')
    const userId = token ? await verifyToken(this.env.SYNC_TOKEN_SECRET, token) : null
    if (!userId) return new Response('unauthorized', { status: 401 })
    const stub = this.env.SYNC_ROOM.get(this.env.SYNC_ROOM.idFromName(userId))
    return stub.fetch(request)
  }

  /** RPC via service binding: o Nuxt chama `env.SYNC.broadcast(userId, message)`,
   *  onde `message` é o JSON já serializado (type/entity/origin/…). */
  async broadcast(userId: string, message: string): Promise<void> {
    if (!userId || !message) return
    const stub = this.env.SYNC_ROOM.get(this.env.SYNC_ROOM.idFromName(userId))
    await stub.broadcast(message)
  }
}

// ── Token: HMAC-SHA256 sobre {uid, exp}. Mesmo formato de server/utils/syncToken.ts ──

async function verifyToken(secret: string, token: string): Promise<string | null> {
  if (!secret) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payloadB64 = token.slice(0, dot)
  const sigB64 = token.slice(dot + 1)
  const expected = await hmac(secret, payloadB64)
  if (!timingSafeEqual(expected, sigB64)) return null
  try {
    const parsed = JSON.parse(b64urlDecode(payloadB64)) as { uid?: string; exp?: number }
    if (!parsed.uid || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null
    return parsed.uid
  } catch {
    return null
  }
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

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

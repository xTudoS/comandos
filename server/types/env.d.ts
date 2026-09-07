type CloudflareEnv = {
  HYPERDRIVE?: Hyperdrive
  AUTH_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  ADMIN_BOOTSTRAP_EMAIL?: string
  SITE_URL?: string
  HQ_BG_CACHE?: KVNamespace
  // Tempo real (Fase 2): service binding para o worker comando-sync e o segredo
  // compartilhado que assina o token do WebSocket.
  SYNC?: { broadcast(userId: string, message: string): Promise<void> }
  SYNC_TOKEN_SECRET?: string
}


declare module 'h3' {
  interface H3EventContext {
    cloudflare: {
      env: CloudflareEnv
      context: ExecutionContext
    }
  }
}

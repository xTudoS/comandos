# comando-sync

Worker dedicado de tempo real (Fase 2). Hospeda o Durable Object `SyncRoom`
(1 por usuário) que mantém os WebSockets via **Hibernation API** e faz broadcast
de invalidações para todos os dispositivos daquele usuário.

O app Nuxt fala com ele de duas formas:

- **broadcast** — via **service binding** (`env.SYNC.broadcast(userId, entity)`),
  disparado no `afterResponse` de mutações (`server/plugins/realtimeBroadcast.ts`).
- **WebSocket** — o browser conecta em `GET /ws?t=<token>`; o token curto é
  emitido pelo Nuxt em `/api/sync/token` e validado aqui com o mesmo segredo.

## Deploy

A partir da raiz do repositório:

```bash
# 1. Segredo do token — MESMO valor nos dois workers
openssl rand -base64 32   # gere um valor e use nos dois comandos abaixo
wrangler secret put SYNC_TOKEN_SECRET --config workers/sync/wrangler.jsonc
wrangler secret put SYNC_TOKEN_SECRET        # worker do Nuxt (wrangler.jsonc na raiz)

# 2. Deploy do worker de sync
wrangler deploy --config workers/sync/wrangler.jsonc

# 3. Pegue a URL pública (…workers.dev) e aponte o Nuxt para ela.
#    Defina NUXT_PUBLIC_SYNC_URL no ambiente de build/deploy do Nuxt:
#    NUXT_PUBLIC_SYNC_URL=wss://comando-sync.<subdominio>.workers.dev/ws
#    (sem isso, o tempo real fica desligado e só o polling da Fase 1 roda)

# 4. Redeploy do Nuxt (o service binding "SYNC" aponta para comando-sync)
pnpm run deploy:cloudflare
```

## Dev local

```bash
wrangler dev --config workers/sync/wrangler.jsonc   # usa .dev.vars para SYNC_TOKEN_SECRET
```

Crie `workers/sync/.dev.vars` (não versionar) com:

```
SYNC_TOKEN_SECRET=algum-valor-de-dev
```

# Comando

Sistema pessoal de comando — tasks, agenda, pagamentos, projetos, notas — multi-usuário com delegação e passkeys.

- **Design system (leia antes de escrever CSS): `design-system/MASTER.md`** — verifique com `pnpm lint:tokens`
- Componentes visuais e tokens vivem em `packages/ui` (Nuxt Layer). O app consome via `extends`; auto-import continua funcionando.
- Spec: `docs/superpowers/specs/2026-04-23-comando-design.md`
- Plano Fase 1: `docs/superpowers/plans/2026-04-23-comando-phase1.md`
- Protótipo de referência: `docs/superpowers/assets/prototype.html`

## Dev

```bash
pnpm install
cp .env.example .env      # preencha segredos
pnpm dev
```

## Offline-first

O app funciona offline (criar/editar com a internet caída e sincronizar ao voltar). Peças, todas client-side:

- **Leitura:** service worker (`StaleWhileRevalidate` em `/api/*`, exceto `/api/auth`) + `useOfflineSync.warm()` aquece tudo no boot.
- **Escrita (otimista + outbox):** a mutação atualiza o estado na hora e, quando offline, enfileira a requisição em `db.syncQueue` (Dexie/IndexedDB) via `lib/offlineQueue.ts`. `useSyncManager.processQueue()` reproduz a fila ao reconectar.
- **Reidratação:** `plugins/persist.client.ts` grava cada lista em `db.cache` a cada mudança e reidrata no boot — é o que faz a alteração offline reaparecer após fechar/reabrir o app.

> **Só dá pra testar de verdade em `pnpm build` + deploy** (SW e app-shell não rodam em `pnpm dev`).

### Regras para não quebrar o offline

Dois bugs reais já vieram daqui — respeite as invariantes:

1. **Persistir sempre dados puros no IndexedDB.** O structured-clone do IndexedDB **quebra em proxies reativos do Vue** (`DataCloneError`, engolido silenciosamente). `toRaw()` só desembrulha o nível de cima; uma lista montada como `[otimista, ...list.value]` ainda guarda proxies nos elementos existentes. Use `toPlain()` (`JSON.parse(JSON.stringify())`) antes de gravar.
2. **`refresh()` não sobrescreve estado local com pendências na fila.** Antes de aplicar a resposta da API, cheque `hasPendingForEntity(entity)` (`lib/offlineQueue.ts`) e pule a atribuição se houver mutação não sincronizada — a releitura pode vir do cache velho do SW (e `navigator.onLine` retorna `true` em wifi-sem-internet/captive portal).
3. **O id é gerado no CLIENTE e enviado no CREATE; o servidor o honra.** Cada `create` gera `crypto.randomUUID()`, manda no corpo do POST e usa o mesmo id no item otimista. O endpoint POST aceita `id` opcional (zod) e o `insert` usa `...(id ? { id } : {})` + `.onConflictDoNothing({ target: T.id })` + fallback que devolve a linha do dono (reenvio idempotente da fila). Sem isso, o servidor gerava um id novo no sync → o item local ficava com id "stale" → `PATCH /api/<x>/<idVelho>` dava **404** (e travava a fila inteira, pois `processQueue` faz `break` no 1º erro) ou virava duplicata "pendente pra sempre". **Não precisa migração** — a coluna `id uuid primaryKey defaultRandom()` já existe; só passamos um valor explícito. O corpo enfileirado precisa estar no **shape do backend** (EN), não no shape local PT (ver `stores/notes.ts` → `toApiBody`).

## Deploy

Cloudflare Workers + Railway Postgres. **Passo a passo completo em
[`DEPLOY.md`](./DEPLOY.md)** — migrations antes do deploy, `wrangler secret put`,
bindings, worker de tempo real, inventário das variáveis e rollback.

🔴 Antes de trocar de domínio, leia o aviso no topo do `DEPLOY.md`: o domínio é o
`rpID` do WebAuthn, e mudá-lo **invalida todas as passkeys cadastradas**.

## Local Postgres

````markdown
```bash
docker run -d --name comando-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=comando_dev \
  -p 5432:5432 \
  postgres:16
```
````

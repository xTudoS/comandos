# Deploy do Comando

Passo a passo para colocar o Comando no ar em **Cloudflare Workers + Postgres**.

**Para quem é:** o dono da instância reimplantando o próprio app. Assume que a
infra de `wrangler.jsonc` já existe (Hyperdrive, KV, domínio). Quem for subir uma
instância nova do zero também consegue — os passos de criação de infra estão na
[§6](#6-infra-do-zero-primeira-instância), e aí os IDs do `wrangler.jsonc`
precisam ser trocados pelos seus.

Formato irmão do [`workers/sync/README.md`](workers/sync/README.md).

---

## 🔴 Leia antes: trocar de domínio derruba todas as passkeys

O domínio **é** o `rpID` do WebAuthn. Passkey cadastrada em `comandos.app` não
funciona em outro host — é garantia do padrão, não bug do app.

A allowlist de hosts é código, não configuração:

```ts
// server/utils/siteOrigin.ts
export const ALLOWED_HOSTS = ['localhost:3003', 'comandos.app', 'hq-brunno-galvao.gitlab-admin-company.workers.dev']
```

Mudar de domínio exige editar essa constante **e** aceitar que todo mundo vai
recadastrar passkey. Planeje a janela e avise antes. O OTP por email continua
funcionando e é o caminho de recuperação.

---

## 1. Pré-requisitos

```bash
node -v          # 22+
pnpm -v          # 12+
wrangler --version
wrangler login
```

Contas necessárias: **Cloudflare** (Workers pago — usa Durable Objects e
Hyperdrive), **Railway** (ou outro Postgres gerenciado) e **Resend** (email).

---

## 2. Banco: migrations ANTES do deploy

Este é o passo que mais se esquece. O worker sobe apontando para o banco de
produção via Hyperdrive; se o schema estiver atrasado, o app quebra em runtime
com erro de coluna inexistente.

```bash
# A connection string do Railway (a EXTERNA, não a interna .railway.internal —
# as migrations rodam da sua máquina, fora da rede deles).
DATABASE_URL='postgres://user:pass@host:5432/railway' pnpm db:migrate
```

`pnpm db:migrate` lê `DATABASE_URL` via `drizzle.config.ts`. Sem a variável no
comando ele usa o `.env` local e **migra o banco errado, em silêncio**.

Conferir o que foi aplicado:

```bash
psql "$DATABASE_URL" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 5"
```

> O runtime **não** usa `DATABASE_URL` — usa o binding `HYPERDRIVE`
> (`server/utils/db.ts` estoura se o binding faltar). `DATABASE_URL` é só para
> migrations, seeds e testes.

---

## 3. Segredos

Nada de segredo em `wrangler.jsonc` (vira texto no repositório) nem como default
de `runtimeConfig` em `nuxt.config.ts` — **default de runtimeConfig vai para o
bundle do worker**. Foi assim que um `AUTH_SECRET` e uma chave da Resend reais
ficaram versionados.

```bash
wrangler secret put NUXT_AUTH_SECRET        # openssl rand -base64 32
wrangler secret put NUXT_RESEND_API_KEY     # re_... do painel da Resend
wrangler secret put SYNC_TOKEN_SECRET       # MESMO valor do worker de sync (§5)
wrangler secret put S3_ACCESS_KEY_ID
wrangler secret put S3_SECRET_ACCESS_KEY

# IA — opcional, e basta UMA. Sem nenhuma, /comando e o classificador ficam
# desligados (com mensagem explicando); o servidor MCP continua funcionando,
# porque lá quem paga o modelo é o cliente.
wrangler secret put NUXT_ANTHROPIC_API_KEY
# ou NUXT_OPENAI_API_KEY / NUXT_GOOGLE_AI_API_KEY
```

**O prefixo `NUXT_` é obrigatório** para tudo que é lido via
`useRuntimeConfig()`: o Nitro procura `NUXT_` + SNAKE_CASE da chave. Uma variável
chamada só `AUTH_SECRET` é ignorada em silêncio. As `S3_*` e `SYNC_TOKEN_SECRET`
são exceção — são lidas de `process.env` / do env do worker direto.

Trocar o `NUXT_AUTH_SECRET` **invalida todas as sessões ativas**. Todo mundo
precisa logar de novo (passkey ou OTP); as passkeys em si continuam válidas.

Conferir: `wrangler secret list`

---

## 4. Deploy do app

```bash
pnpm install
pnpm run deploy:cloudflare   # = nuxi build && wrangler deploy
```

Depois:

```bash
curl -sI https://comandos.app | head -1          # 200
wrangler tail                                    # logs ao vivo
```

### Primeiro owner — precisa ser feito à mão

⚠️ **Não existe bootstrap automático de owner.** `NUXT_ADMIN_BOOTSTRAP_EMAIL`
está declarada em `nuxt.config.ts`, em `wrangler.jsonc:vars` e nos tipos do
worker, mas **nenhum código a lê** — é configuração inerte. Quem contar com ela
sobe a instância e descobre que ninguém consegue acessar `/admin`.

Todo usuário novo nasce `delegate` (`users.role` tem
`.default('delegate')`). Promover é passo manual, por um dos dois caminhos:

```bash
# Antes do primeiro login — cria o usuário já como owner
SEED_EMAIL=voce@exemplo.com SEED_NAME='Seu Nome' SEED_ROLE=owner \
  DATABASE_URL='postgres://...' pnpm db:seed:user

# Depois do primeiro login (entrou por OTP e já existe na tabela)
psql "$DATABASE_URL" -c "update users set role='owner' where email='voce@exemplo.com'"
```

Depois entre por OTP e cadastre uma passkey em `/settings/devices`.

---

## 5. Worker de tempo real (opcional, mas o app conta com ele)

Sem isso o app cai no polling da Fase 1 — funciona, só não é instantâneo.
Passo a passo completo em [`workers/sync/README.md`](workers/sync/README.md):

```bash
wrangler secret put SYNC_TOKEN_SECRET --config workers/sync/wrangler.jsonc  # mesmo valor do §3
wrangler deploy --config workers/sync/wrangler.jsonc
# pegue a URL e ajuste NUXT_PUBLIC_SYNC_URL em wrangler.jsonc → redeploy do app
```

O service binding `SYNC` em `wrangler.jsonc` aponta para `comando-sync`. **Se o
worker de sync não existir, o deploy do app falha** — suba ele primeiro, ou
remova o binding.

---

## 5.1 Conectar o Claude (MCP)

O Comando expõe as próprias tarefas como ferramentas MCP em `POST /api/mcp`.
**Não consome chave de IA sua** — quem paga o modelo é o cliente. Funciona mesmo
sem nenhuma variável de IA configurada.

1. Em `/settings/mcp`, crie um token. Escolha somente-leitura (padrão) ou
   leitura e escrita.
2. Copie o valor **na hora** — o banco guarda só o sha256, não há como revê-lo.
3. No seu terminal:

```bash
claude mcp add --transport http comando https://comandos.app/api/mcp \
  --header "Authorization: Bearer cmdo_..."
```

Ferramentas expostas: `list_tasks`, `get_task`, `get_agenda`, `get_stats`,
`list_context` e — só com token de escrita — `create_task`, `update_task`,
`complete_task`, `archive_task`.

Todas passam pelos mesmos serviços da API, então herdam o ACL de
`server/utils/accessFilter.ts`: um token não enxerga nada que o dono dele já não
enxergasse no app. Revogar é imediato, em `/settings/mcp`.

---

## 6. Infra do zero (primeira instância)

Só na primeira vez. Os IDs saem daqui e vão para `wrangler.jsonc`.

```bash
# Hyperdrive — pool de conexões para o Postgres (o Worker não abre TCP direto)
wrangler hyperdrive create comando-db --connection-string="$DATABASE_URL"
#   → copie o id para "hyperdrive[0].id"

# KV — secondaryStorage do better-auth (sessões). Sem isso useAuth() estoura.
wrangler kv namespace create HQ_BG_CACHE
#   → copie o id para "kv_namespaces[0].id"
```

**Domínio:** adicione a zona no Cloudflare, aponte os nameservers, e ajuste
`routes[0]` (`zone_name` + `pattern`) no `wrangler.jsonc`. Depois inclua o host
em `ALLOWED_HOSTS` (`server/utils/siteOrigin.ts`) — reveja o aviso do topo.

**Resend:** crie a conta, verifique o **domínio de envio** e publique SPF, DKIM e
DMARC no DNS. Sem domínio verificado a Resend recusa o envio e o app perde OTP de
login, convites e todos os emails de agendamento. `NUXT_RESEND_FROM_EMAIL`
precisa estar nesse domínio.

**S3 (anexos):** qualquer storage compatível. Sem as chaves, `/api/attachments/*`
quebra (`server/utils/storage.ts`); o resto do app segue funcionando.

---

## 7. Variáveis de ambiente — inventário completo

### Runtime do worker (produção)

| Variável | Onde entra | Lida em | Falta dela |
|---|---|---|---|
| `NUXT_AUTH_SECRET` | secret | `server/utils/auth.ts` | **quebra explícita** no boot da auth |
| `NUXT_RESEND_API_KEY` | secret | `server/utils/mailer.ts` | email vira stub no console — **falha silenciosa** |
| `SYNC_TOKEN_SECRET` | secret | `server/api/sync/token.get.ts` | tempo real desligado |
| `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` | secret | `server/utils/storage.ts` | anexos quebram |
| `NUXT_PUBLIC_SITE_URL` | `vars` | `runtimeConfig.public.siteUrl` | links de convite/agendamento com host errado |
| `NUXT_RESEND_FROM_EMAIL` | `vars` | `server/utils/mailer.ts` | `send()` estoura |
| `NUXT_ADMIN_BOOTSTRAP_EMAIL` | `vars` | **ninguém — var inerte** (ver §4) | nada |
| `NUXT_PUBLIC_SYNC_URL` | `vars` | `runtimeConfig.public.syncUrl` | só polling |
| `NUXT_ANTHROPIC_API_KEY` · `NUXT_OPENAI_API_KEY` · `NUXT_GOOGLE_AI_API_KEY` | secret | `server/utils/llm/` | `/comando` e o classificador respondem erro; MCP e o resto seguem |
| `NUXT_LLM_PROVIDER` · `NUXT_LLM_MODEL` | `vars` | `server/utils/llm/index.ts` | usa o 1º provedor com chave e o modelo padrão dele |
| `BETTER_AUTH_URL` | `vars` | better-auth | resolução de URL base |
| `S3_ENDPOINT` · `S3_REGION` · `S3_BUCKET` · `S3_PUBLIC_BASE_URL` | `vars` | `server/utils/storage.ts` | anexos quebram |

Bindings (não são variáveis, mas são pré-requisito): `HYPERDRIVE`, `HQ_BG_CACHE`
(KV), `SYNC` (service binding), `ASSETS`, e `SYNC_ROOM` (Durable Object, no
worker de sync).

### Build e scripts (nunca no runtime do worker)

| Variável | Usada por |
|---|---|
| `DATABASE_URL` | `drizzle.config.ts`, `pnpm db:*`, seeds |
| `BETTER_AUTH_TELEMETRY=0` | script `deploy:cloudflare` (desliga telemetria no build) |
| `TEST_DATABASE_URL` · `ALLOW_TEST_DB_WIPE` | `tests/integration/helpers.ts` — **os testes dão TRUNCATE no banco inteiro**; o nome precisa terminar em `_test` |
| `SEED_EMAIL` · `SEED_NAME` · `SEED_ROLE` | `pnpm db:seed:user` |
| `DEMO_EMAIL` · `DEMO_NAME` | `pnpm db:seed:demo` |
| `IA_OWNER` | `pnpm ia` (dono padrão sem repetir `--owner`) |

### Modo demonstração (apresentação/webinar — manter DESLIGADO em produção)

| Variável | Efeito |
|---|---|
| `NUXT_DEMO_BYPASS=1` | **liga `/api/auth/demo-login`, que loga sem senha nenhuma** |
| `NUXT_DEMO_EMAIL` | conta usada pelo bypass |
| `NUXT_PUBLIC_DEMO_MODE=1` | mostra o botão "Entrar como demo" no login |

---

## 8. Setup pós-download (rodar local)

```bash
pnpm install
cp .env.example .env          # preencha NUXT_AUTH_SECRET com openssl rand -base64 32

docker run -d --name comando-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=comando_dev \
  -p 5432:5432 postgres:16

pnpm db:migrate
pnpm db:seed:user             # SEED_EMAIL=voce@exemplo.com SEED_ROLE=owner
pnpm dev                      # http://localhost:3000
```

Deixe `NUXT_RESEND_API_KEY` vazio em dev: o mailer cai no stub e **imprime o
email no console**, que é de onde saem o código OTP e os links de agendamento.

Para rodar os testes de integração, crie o banco separado:

```bash
psql postgres://postgres:postgres@localhost:5432/postgres -c 'create database comando_test'
TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5432/comando_test' pnpm db:migrate
pnpm test
```

> **O offline-first não roda em `pnpm dev`.** Service worker e app-shell só
> existem em build. Para testar de verdade: `pnpm build` + deploy.

---

## 9. Rollback

```bash
wrangler deployments list
wrangler rollback [--message "motivo"]
```

⚠️ `wrangler rollback` volta o **código**, não o **banco**. Se o deploy veio com
migration, o schema continua novo e a versão antiga pode não falar com ele.
Migration destrutiva (drop/rename de coluna) exige o padrão expand/contract:
suba a coluna nova, migre o código, e só remova a antiga num deploy seguinte.

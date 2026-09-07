# Comando — Design Spec

**Data:** 2026-04-23
**Autor:** Brunno (brainstorming com Claude)
**Status:** Aprovado para writing-plans

---

## 1. Contexto e objetivo

Brunno tem um protótipo HTML single-file chamado **Comando** que funciona como centro de comando pessoal: tarefas em horizontes temporais, agenda 3-dias, pagamentos, projetos, notas e arquivo, tudo salvo em `localStorage`. O objetivo é transformar o protótipo em um sistema multi-usuário 100% funcional, com autenticação forte e delegação de tarefas para pessoas de confiança.

### Resumo do que o sistema precisa fazer

- Brunno gerencia seu próprio workspace (tasks, agenda, pagamentos, projetos, notas, arquivo).
- Brunno delega tarefas para pessoas de confiança ("delegates"). Cada delegate tem seu próprio workspace onde recebe as tarefas delegadas e pode criar suas próprias tarefas pessoais (que Brunno não vê).
- Existe um papel especial de "assistente" (um único delegate marcado). Tarefas marcadas como "Pessoal" por Brunno são auto-delegadas para o assistente (mas continuam visíveis na visão de Brunno com badge).
- Autenticação por passkey com mecanismo de trust device: primeiro login por OTP de email; cadastrar passkey em novo dispositivo requer aprovação (com step-up de passkey + assinatura criptográfica) de um dispositivo previamente trusted.
- Todo histórico de mudanças é auditado e visível na UI da tarefa.

### Goals

- Sistema funcional multi-usuário mantendo a ergonomia e o visual do protótipo.
- Auth sem senha, forte, com não-repudiação em aprovações de dispositivos.
- Delegação cross-workspace com auditoria completa.
- Deploy serverless em Cloudflare Workers.
- Entrega faseada para reduzir risco.

### Non-goals

- Mobile app nativo (web responsivo é suficiente).
- Offline-first / sync multi-device (TanStack Query com polling cobre).
- Realtime por WebSocket (polling é suficiente).
- Suporte a múltiplos owners (Brunno é owner único; delegates podem eventualmente delegar mais tarde, mas Phase 1 não).
- Recovery automático de auth (admin resolve manualmente).
- Migração do localStorage (começar do zero).

---

## 2. Stack e princípios

- **Nuxt 4** (via `pnpm create nuxt@latest`), pnpm.
- **Nuxt UI v3** para componentes base; customizações CSS do protótipo via tokens no `app.config.ts`.
- **Nitro preset `cloudflare-module`** para deploy em Cloudflare Workers; `nodejs_compat` habilitado.
- **Drizzle ORM** com `drizzle-orm/node-postgres`, driver `pg`.
- **Railway Postgres** como banco.
- **Cloudflare Hyperdrive** como binding para connection pooling.
- **TanStack Query** (`@tanstack/vue-query`) para fetch/cache/sync com `refetchOnWindowFocus`, staleTime curto, polling leve.
- **better-auth** com plugins `passkey` + `emailOTP`; **plugin custom de device approval**.
- **Resend** para email transacional.
- **Railway S3-compatible storage** para anexos (Phase 2), via `@aws-sdk/client-s3` + presigned URLs.

### Princípio crítico: banco nunca no escopo global

Deploy é serverless. A instância `db` é criada **por request**, nunca como singleton de módulo:

```ts
// server/utils/db.ts
export function useDb(event: H3Event) {
  const pool = new Pool({
    connectionString: event.context.cloudflare.env.HYPERDRIVE.connectionString
  })
  return drizzle(pool, { schema })
}
```

Em todos os handlers: `const db = useDb(event)`. Nenhum `const db = drizzle(...)` no top-level de nenhum módulo.

Uma regra de lint custom (`no-raw-db-update`) impede `db.update(table)` fora do helper `server/utils/audit.ts`, garantindo que toda mutation passe pelo audit trail.

### Idioma

- **Backend** (tabelas, colunas, tipos, código server, nomes de variáveis): **inglês**.
- **Frontend** (páginas, textos, componentes visíveis): **português** — mantém linguagem do protótipo.

---

## 3. Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  Cliente (Nuxt SPA)                                         │
│  6 views: Trabalho, Agenda, Pagamentos, Projetos, Notas,    │
│  Arquivo. Nuxt UI + composables TanStack Query.             │
└────────────┬────────────────────────────────────────────────┘
             │ JSON over HTTPS
┌────────────▼────────────────────────────────────────────────┐
│  server/ (Nitro Worker)                                     │
│  api/auth/*, api/tasks/*, api/agenda/*, api/people/*,       │
│  api/invitations/*, api/audit/*, api/admin/*                │
│  (Phase 2) api/payments/*, api/projects/*, api/notes/*,     │
│            api/attachments/*                                │
│  middleware: auth (session), rateLimit                      │
│  utils: db (per-request), audit, accessFilter,              │
│         signatureAudit, mailer, challenges, rateLimit       │
└────────────┬────────────────────────────────────────────────┘
             │ pg via Hyperdrive
┌────────────▼────────────────────────────────────────────────┐
│  Railway Postgres                                           │
└─────────────────────────────────────────────────────────────┘

Externos: Resend (email), Railway S3 (arquivos, Phase 2)
```

---

## 4. Data model

Todas as tabelas e colunas em inglês.

### 4.1 Autenticação (better-auth owna)

- **`users`**: `id` uuid pk, `email` text unique, `name` text, `email_verified` bool, `image` text null, `role` enum('owner','delegate'), `created_at`, `updated_at`.
- **`sessions`**, **`accounts`**, **`verifications`**, **`passkeys`**: padrão better-auth.

### 4.2 Core (Phase 1)

**`people`** — diretório de delegáveis do owner.
- `id` uuid pk
- `owner_user_id` fk→users
- `name` text
- `linked_user_id` fk→users null (preenchido quando a pessoa aceita o convite)
- `is_assistant` bool default false — partial unique index em `(owner_user_id)` com `WHERE is_assistant = true`, garantindo no máximo um assistente por owner
- `archived` bool · timestamps

**`person_invitations`**
- `id`, `person_id` fk→people, `email`, `token_hash`, `status` enum('pending','accepted','expired','revoked')
- `sent_at`, `accepted_at`, `expires_at`, `invited_by_user_id`

**`device_approvals`**
- `id` uuid pk · `user_id` fk→users
- `request_fingerprint` text (cookie long-lived do dispositivo novo)
- `request_user_agent` text · `request_ip` inet
- `status` enum('pending','approved','rejected','expired')
- `decided_by_session_id` fk→sessions null
- `decided_with_passkey_id` fk→passkeys null
- `decision_payload` jsonb null — documento canônico assinado
- `decision_signature` bytea null — assertion.signature
- `decision_client_data` bytea null — assertion.clientDataJSON
- `decision_authenticator_data` bytea null
- `requested_at`, `decided_at` null, `expires_at` (default now()+15min)
- index `(user_id, status)`

**`tasks`**
- `id` uuid pk
- `owner_user_id` fk→users — quem vê na visão "minhas tarefas" (sempre quem criou, em Phase 1)
- `created_by_user_id` fk→users — trava permissão de reatribuir
- `delegate_person_id` fk→people null
- `title` text not null · `description` text
- `horizon` enum('core30','core60','core90','micro','backlog','hibernating')
- `type` enum('ceo','delegate','personal')
- `project_id` fk→projects null (coluna presente em Phase 1; FK ativa em Phase 2)
- `scheduled_date` date null · `scheduled_time` time null · `duration_minutes` int null
- `followup_active` bool default false
- `followup_date` date null · `followup_holder_person_id` fk→people null
- `done` bool default false · `completed_at` timestamptz null
- `archived` bool default false · timestamps
- index `(owner_user_id, archived, horizon)`, `(delegate_person_id)`, `(scheduled_date)`

**`checklist_items`**
- `id` uuid pk · `task_id` fk→tasks (cascade)
- `position` int · `text` text · `done` bool · `done_at` timestamptz null · timestamps

**`task_annotations`**
- `id` uuid pk · `task_id` fk→tasks (cascade)
- `author_user_id` fk→users · `body` text · `created_at`
- index `(task_id, created_at DESC)`

**`audit_log`** — polimórfico, fonte única da verdade de histórico.
- `id` bigserial pk
- `entity_type` text ('task','checklist_item','annotation','person','device_approval',...)
- `entity_id` uuid
- `action` enum('create','update','delete','archive','restore','reassign','complete','uncomplete','approve','reject')
- `actor_user_id` fk→users
- `changes` jsonb — diff campo-a-campo `{ field: { from, to } }`. Para `create`/`delete`, guarda linha completa.
- `context` jsonb null — extras (ex: para `approve`, guarda `signed_payload`, `signature`, `client_data`, `authenticator_data`, `passkey_id`)
- `at` timestamptz default now()
- index `(entity_type, entity_id, at DESC)`, `(actor_user_id, at DESC)`

**Reagendamentos** não têm tabela dedicada — derivam de `audit_log` filtrando `entity_type='task' AND changes ? 'scheduled_date'`. Endpoint `GET /api/tasks/:id/reschedules` retorna lista ordenada.

### 4.3 Phase 2 (estrutura desenhada, migração depois)

**`projects`**: `id`, `owner_user_id`, `name`, `category` enum('company','product','general','personal'), `parent_project_id` fk→projects null, `notes`, `archived`, timestamps. Unique `(owner_user_id, lower(name))`.

**`notes`**: `id`, `owner_user_id`, `title`, `body`, `type` enum('playbook','credential','contact','decision','reference'), `project_id` null, `status` enum('active','draft'), `archived`, timestamps.

**`payments`**: `id`, `owner_user_id`, `description`, `amount_cents` bigint, `due_date` null, `status` enum('pending','paid'), `paid_at` null, `notes`, `archived`, timestamps. "Atrasado" derivado: `status='pending' AND due_date < today`.

**`attachments`** — polimórfico.
- `id` uuid · `entity_type` text · `entity_id` uuid
- `storage_key` text · `mime_type` text · `size_bytes` bigint · `original_filename` text
- `uploaded_by_user_id` fk→users · `created_at`
- index `(entity_type, entity_id)`
- Max 25 MB · qualquer MIME com whitelist configurável · múltiplos por entidade.

### 4.4 Controle de acesso

Sem RLS Postgres. Helper `accessFilter(entity, user)` retorna where-clause Drizzle:

| entidade   | acesso                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------- |
| task       | `owner_user_id=me` OR (JOIN people ON delegate_person_id WHERE linked_user_id=me)                 |
| checklist  | herda da task                                                                                     |
| annotation | herda da task                                                                                     |
| note       | `owner_user_id=me`                                                                                |
| payment    | `owner_user_id=me`                                                                                |
| project    | `owner_user_id=me`                                                                                |
| person     | `owner_user_id=me` OR `linked_user_id=me`                                                         |
| audit_log  | acesso à entity implica acesso ao log                                                             |
| attachment | herda da entity                                                                                   |

Toda leitura passa pelo filtro. Toda mutation verifica explicitamente antes de escrever e grava em `audit_log` via helper `auditedUpdate`.

---

## 5. Autenticação detalhada

### 5.1 Bootstrap (primeiro login de qualquer conta)

1. UI `/login` pede email.
2. `POST /api/auth/email-otp/send` — Resend envia OTP 6 dígitos.
3. `POST /api/auth/email-otp/verify`:
   - Se user não existe: nega (contas nascem só por convite).
   - Se user já tem passkey: nega com `ERR_DEVICE_APPROVAL_REQUIRED`.
   - Se user sem passkey: cria sessão temporária (15min) para registrar passkey.
4. UI → `/onboarding/passkey`: `navigator.credentials.create()`.
5. `POST /api/auth/passkey/register/*`: grava passkey, marca dispositivo como trusted (cookie `device_fingerprint` httpOnly 1 ano).
6. Sessão promove para "full access".

### 5.2 Login em dispositivo trusted

- Cookie `device_fingerprint` + `navigator.credentials.get()` WebAuthn conditional UI.
- `POST /api/auth/passkey/authenticate` → sessão nova.

### 5.3 Login em dispositivo novo (user já tem passkey)

1. UI `/login` sem cookie reconhecido.
2. Email + OTP `/send` + `/verify`.
3. Verify nega passkey-path com `ERR_DEVICE_APPROVAL_REQUIRED`:
   - Cria `device_approvals` (pending, +15min).
   - Seta cookie `pending_fingerprint` no device novo.
   - Email para user: "pediu acesso de novo dispositivo — aprove no seu trusted".
4. UI novo → `/login/waiting`: polling 3s em `GET /api/auth/device-approvals/:id/status`.
5. Aprovado: device novo recebe onboarding session → `/onboarding/passkey` → registra → trusted.
6. Rejeitado/expirado: "Acesso negado, contate admin."

### 5.4 Aprovação com assinatura criptográfica (step-up + não-repudiação)

Usuário logado em device trusted vê banner "1 pedido pendente". Ao clicar Aprovar ou Rejeitar:

1. `GET /api/auth/device-approvals/:id/challenge`:
   - Backend monta `decision_payload` canônico:
     ```json
     {
       "approval_id": "<uuid>",
       "decision": "approve" | "reject",
       "target_user_id": "<user>",
       "requester_fingerprint": "...",
       "requester_ua": "...",
       "requester_ip": "...",
       "decided_at": "<ISO>",
       "nonce": "<32 random bytes base64>"
     }
     ```
   - `challenge = SHA-256(canonical_json(decision_payload))`
   - Guarda em store de challenges (TTL 2min, one-shot).
   - Retorna `{ challenge, allowCredentials, decision_payload }`.

2. UI mostra resumo legível do que está sendo decidido e dispara `navigator.credentials.get({ publicKey: { challenge, allowCredentials, userVerification: 'required' } })`.

3. `POST /api/auth/device-approvals/:id/decide { decision_payload, assertion }`:
   - Recupera challenge esperado, valida que `SHA-256(canonical_json(decision_payload)) === challenge`.
   - Verifica assinatura WebAuthn contra `passkeys.public_key` do credentialId.
   - Consome challenge.
   - Grava em `device_approvals`: `decision_payload`, `decision_signature`, `decision_client_data`, `decision_authenticator_data`, `decided_with_passkey_id`, `decided_at`, `decided_by_session_id`.
   - Se approve: cria onboarding session para device novo.
   - Escreve `audit_log` com action `approve`/`reject` e `context` contendo toda a prova criptográfica.

Aprovar E rejeitar exigem passkey. Garante que cookie de sessão roubado não basta para aprovar nem para lockar a vítima rejeitando.

**Prova forense futura:** qualquer audit entry `approve`/`reject` pode ser re-verificado: `SHA-256(canonical_json(context.signed_payload)) === challenge` extraído de `client_data` + validação da assinatura contra `passkeys.public_key`.

### 5.5 Convite de delegado

1. Você em `/settings/people` clica "Convidar" em pessoa sem `linked_user_id`.
2. `POST /api/people/:id/invite`:
   - Cria `users` com role='delegate', `email_verified=false`.
   - Atualiza `people.linked_user_id`.
   - Cria `person_invitations` com `token_hash`, expires +7d.
   - Resend envia link `https://app/invite/:token`.
3. Delegado abre link → `GET /invite/:token` mostra "Brunno convidou você. Digite seu nome".
4. `POST /api/invitations/:token/accept` → cria sessão bootstrap → `/onboarding/passkey` (fluxo 5.1 dali em diante).

### 5.6 Recovery

Sem auto-recovery. Painel `/admin/users` (só role='owner', só Brunno):
- "Resetar dispositivos" em qualquer user: deleta todas as passkeys e device_approvals pending. Próximo login vira bootstrap via OTP.
- "Reenviar convite" para users com `passkeys=0` e invitation=pending.

Se **Brunno** perde todos os dispositivos: plano B manual via acesso direto ao Postgres (Railway console) ou script `pnpm reset-owner-devices` com `DATABASE_URL` local.

### 5.7 Rate limiting

- OTP send: 5/h/email.
- Decide: 30/h/user.
- Passkey authenticate: 20/min/IP.
- Storage do limiter: Cloudflare KV (preferencial) ou tabela Postgres com cleanup.

---

## 6. Delegação, audit e timeline

### 6.1 Criando task com delegação

- **CEO** (`type=ceo`): `delegate_person_id=null`.
- **Delego** (`type=delegate`): autocomplete em `people` do owner. Se digitar nome novo, cria `people(name, linked_user_id=null)` antes de salvar a task.
- **Pessoal** (`type=personal`): server auto-seta `delegate_person_id = people.where(is_assistant AND owner=me).id`. Se não houver assistente: UI bloqueia e manda para `/settings/people` com erro `ERR_NO_ASSISTANT`.

### 6.2 Duas visões da mesma tarefa (uma única row)

Filtro do `accessFilter` para tasks:
```
owner_user_id = me
 OR exists people WHERE people.id = tasks.delegate_person_id
                  AND people.linked_user_id = me
```

- **Workspace do owner:** tasks dele. Badge "→ Maria" quando delegadas. Pessoal tem badge "→ Maria (assistente)".
- **Workspace do delegado:** tasks delegadas a ele. Badge "de Brunno" (via `created_by_user_id`).

### 6.3 Permissões

Ambos (owner e delegado) podem fazer tudo em uma task delegada:
- toggle done, editar título/descrição, mudar horizonte, reagendar, checklist, anotações, arquivar, deletar.

**Exceção — reassign** (mudar `delegate_person_id`): só `event.context.user.id === task.created_by_user_id` pode. UI esconde o campo para quem não pode. Server retorna `ERR_REASSIGN_FORBIDDEN`.

### 6.4 Delegação pendente + vínculo retroativo

- T0: delegar para "Caio" (sem conta) → `people.linked_user_id=null` → task aponta para `people.caio.id`. Badge "pendente" na sua visão.
- T1: você convida Caio; ao aceitar, `people.linked_user_id` vira `users.caio.id`.
- T2: próximo fetch de Caio: todas as tasks já delegadas a ele aparecem retroativamente (não precisa reatribuir).

### 6.5 Audit via helper

```ts
async function auditedUpdate(tx, table, id, actor, patch, opts?) {
  const [before] = await tx.select().from(table).where(eq(table.id, id))
  const [after]  = await tx.update(table).set(patch)
                    .where(eq(table.id, id)).returning()
  const changes  = diffFields(before, after)
  if (!Object.keys(changes).length) return after
  await tx.insert(audit_log).values({
    entity_type: table._.name, entity_id: id,
    action: inferAction(patch, before, after),
    actor_user_id: actor, changes, context: opts?.context
  })
  return after
}
```

`inferAction` mapeia:
- `{ done: true }` (antes false) → `complete`
- `{ done: false }` (antes true) → `uncomplete`
- `{ archived: true }` → `archive` / `{ archived: false }` → `restore`
- `{ delegate_person_id: ... }` → `reassign`
- outro → `update`

Lint rule custom `no-raw-db-update` proíbe `db.update(...)` fora de `server/utils/audit.ts`.

### 6.6 Timeline na UI da task

Tab "Histórico" no modal da task. `GET /api/audit?entity=task&id=:id` agrega:
- audit_log rows da própria task.
- audit_log rows de `checklist_items` com `task_id=:id`.
- audit_log rows de `task_annotations` com `task_id=:id`.
- (Phase 2) audit_log rows de `attachments`.

Renderizador client agrupa eventos do mesmo autor em janela de 1h para manter enxuto. Reagendamentos são destacados visualmente: "de X → para Y".

Endpoint respeita o `accessFilter` — quem não pode ver a task, não vê o log dela.

### 6.7 Sync cross-workspace

TanStack Query:
- Chaves: `['tasks', {view}]`, `['tasks', id]`, `['audit', 'task', id]`, `['agenda', range]`, `['people']`.
- `refetchInterval: 45_000` em listas vivas; `refetchOnWindowFocus: true`; `staleTime: 15_000` em tasks, `10_000` em agenda, `5min` em settings.
- Mutations invalidam: `queryClient.invalidateQueries({ queryKey: ['tasks'] })` + `['audit', 'task', id]`.

Não há websockets nem durable objects em Phase 1. Polling + focus-refetch cobrem: Maria vê uma task recém-delegada em até 45s em background ou imediato ao voltar à aba.

---

## 7. File layout Nuxt

```
comando/
├── app/
│   ├── app.vue · app.config.ts
│   ├── assets/css/main.css
│   ├── layouts/default.vue · auth.vue
│   ├── pages/
│   │   ├── index.vue (→ /trabalho)
│   │   ├── trabalho.vue · agenda.vue
│   │   ├── pagamentos.vue · projetos.vue · notas.vue · arquivo.vue  (Phase 2)
│   │   ├── login.vue · onboarding/passkey.vue · login/waiting.vue
│   │   ├── invite/[token].vue
│   │   ├── settings/index.vue · devices.vue · people.vue
│   │   └── admin/users/index.vue · [id].vue
│   ├── components/
│   │   ├── topbar/ · tarefas/ · agenda/ · delegacao/
│   │   ├── audit/ · auth/ · ui/
│   ├── composables/
│   │   └── useAuth · useTasks · useAgenda · usePeople · useAudit · useDeviceApprovals · useToast
│   ├── middleware/auth.global.ts · admin.ts
│   └── utils/dates.ts · format.ts · horizontes.ts · escape.ts
├── server/
│   ├── api/
│   │   ├── auth/[...handler].ts
│   │   │   ├── device-approvals/ (index.get, [id].get, [id]/challenge.get, [id]/decide.post)
│   │   │   └── email-otp/ (custom bootstrap guard)
│   │   ├── tasks/ (index, [id], complete, archive, reassign, reschedules, checklist, annotations)
│   │   ├── agenda/index.get.ts
│   │   ├── people/ (CRUD, invite, assistant)
│   │   ├── invitations/[token]/accept.post.ts
│   │   ├── audit/index.get.ts
│   │   └── admin/ (users, reset-devices)
│   ├── db/
│   │   ├── schema/ (auth, people, tasks, audit, projects, notes, payments, attachments, index)
│   │   └── migrations/
│   ├── middleware/ (00.auth.ts · 01.rateLimit.ts)
│   └── utils/
│       └── db · auth · accessFilter · audit · signatureAudit · mailer · presign · challenges · rateLimit
├── drizzle.config.ts · wrangler.toml · nuxt.config.ts
├── package.json · pnpm-lock.yaml · tsconfig.json
├── eslint.config.mjs (com no-raw-db-update)
└── README.md
```

### Configurações chave

**`nuxt.config.ts`** — módulos `@nuxt/ui`, `@nuxt/eslint`; nitro preset `cloudflare-module` com `nodeCompat: true`; `runtimeConfig` com `resendApiKey`, `authSecret`, `public.siteUrl`.

**`wrangler.toml`** — `compatibility_flags=["nodejs_compat"]`; `[[hyperdrive]]` binding `HYPERDRIVE`; secrets via `wrangler secret put` (RESEND_API_KEY, AUTH_SECRET, S3_*, ADMIN_BOOTSTRAP_EMAIL).

---

## 8. Fases de entrega

### Phase 1 — MVP (auth + tasks + delegação + agenda + audit)

1. **Infra**: repo, `pnpm create nuxt@latest`, Nuxt UI, wrangler, Hyperdrive, Drizzle, CI (build + typecheck + lint).
2. **Auth completa**: passkey + email OTP bootstrap, device approval com assinatura (step-up), `/settings/devices`, recovery admin.
3. **People**: `/settings/people` CRUD + convite + vínculo retroativo + set assistente.
4. **Tasks**: CRUD, horizontes drag & drop, checklist, anotações, tipos (CEO/Delego/Pessoal), reatribuir restrito.
5. **Agenda**: mini calendar + grade 3 dias + follow-up.
6. **Audit**: helper, timeline no modal, reagendamentos derivados.
7. **Topbar**: KPIs + busca global (tasks + people).
8. **Polling**: TanStack Query configurado.
9. **UI do protótipo portada**: Trabalho + Agenda ativas; Pagamentos/Projetos/Notas/Arquivo aparecem como tabs "em breve".
10. **Deploy** Cloudflare + smoke test.

### Phase 2 — complemento

1. **Projects** (CRUD + hierarquia empresa→produto + vínculo em tasks).
2. **Notes** (CRUD + 5 tipos + warning credencial + filtros).
3. **Payments** (CRUD + status derivado atrasado + resumo).
4. **Attachments** (presign Railway S3 + whitelist MIME + múltiplos + UI drag-drop + preview).
5. **Archive** (tab Arquivo).
6. **Export/Import** do próprio sistema (backup JSON).

---

## 9. Qualidade

### Testes

- **Unit (vitest)**: `diffFields`, `buildDecisionPayload`, `verifyApprovalAssertion`, `accessFilter`, lógica tipo='personal' + auto-delegação.
- **Integração (vitest + Postgres real, ex: testcontainers)**: endpoints de tasks com cenários completos de delegação e permissão.
- **E2E (Playwright)**: fluxo bootstrap completo com WebAuthn mockado via `@web-auth/virtual-authenticator`.

### Error model

Todos os endpoints retornam `{ error: { code, message, details? } }`. Códigos próprios:
- `ERR_DEVICE_APPROVAL_REQUIRED`
- `ERR_NO_ASSISTANT`
- `ERR_REASSIGN_FORBIDDEN`
- `ERR_INVITATION_EXPIRED`
- `ERR_APPROVAL_EXPIRED`
- `ERR_SIGNATURE_INVALID`
- `ERR_RATE_LIMITED`

### Observability

Logger estruturado pino-compatível nos Workers, request-id propagado, breadcrumbs em audit. Cloudflare Workers Logs + opcional Logtail.

### Env

`.env.example` com todas as chaves. Secrets via `wrangler secret`. README com setup local (Postgres via docker-compose ou Railway dev branch).

### Migrations

`drizzle-kit generate` no dev. CI aplica `drizzle-kit migrate` em produção antes do deploy (GitHub Action).

---

## 10. Riscos e decisões explícitas

- **Polling 45s vs realtime**: decidido polling (YAGNI). Se ficar insuficiente, Cloudflare Durable Objects + SSE é migração viável.
- **Audit via aplicação vs trigger SQL**: aplicação (testabilidade, contexto rico). Enforcement por lint custom + PR review.
- **RLS Postgres não usado**: mais simples ter controle na aplicação com Hyperdrive; RLS seria reintroduzido se formos multi-tenant real.
- **`delegate_person_id` vs `task_assignments` N:N**: escolhido campo direto (YAGNI). Migração futura é trivial.
- **Sem migração do protótipo**: dados do localStorage eram só teste.
- **Assistente slot único**: `people.is_assistant` com partial unique index.
- **Email OTP apenas em bootstrap**: após 1ª passkey, todo login novo passa por device approval.
- **Brunno sem recovery automático**: aceito — acesso direto ao DB é fallback.

---

## 11. Próximos passos

Depois desta revisão:
1. Brunno confirma ou pede ajustes.
2. Invocar skill `writing-plans` para detalhar plano de implementação do Phase 1.
3. Brunno provisiona: conta Cloudflare + binding Hyperdrive + Railway Postgres + Railway Storage + conta Resend + domínio. Entrega secrets.
4. Começar execução por infra (repo → Nuxt → wrangler → Drizzle → primeira migration).

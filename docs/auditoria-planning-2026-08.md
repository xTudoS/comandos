# Auditoria da planning — agosto/2026

> ## ⚠️ Documento histórico — o placar abaixo está desatualizado
>
> **Atualizado em 2026-09-07.** Esta auditoria continua valendo como o
> *diagnóstico* de cada item (o que existia, o que faltava, o que reusar), mas o
> **placar não reflete mais o repositório**. Desde então:
>
> | # | Item | Estado hoje |
> |---|---|---|
> | 1 | Compartilhamento de agenda | ✅ ciclo fechado — token de ação no email, recusa cancela e **arquiva** a tarefa, remarcar avisa e reemite o link |
> | 2 | Onboarding | ✅ tour dos horizontes em `/onboarding` + `users.onboarding_completed_at` |
> | 3 | Landing page | ✅ (já estava) |
> | 4 | Atraso no calendário | ✅ `app/utils/overdue.ts` + estado `.overdue` em `AgendaEventCard` |
> | 5 | Agenda de atrasados + alarme | ✅ filtro 7/30/tudo + badge vermelho no menu |
> | 6 | Hospedagem | ✅ [`DEPLOY.md`](../DEPLOY.md) |
> | 7 | Plugar Claude | ✅ servidor MCP em `/api/mcp` + tokens em `/settings/mcp` |
> | 8 | SUAT | ⏸️ segue adiado |
> | 9 | IA preenchendo campos | ✅ `POST /api/tasks/[id]/classify`, sugere-e-confirma |
> | 10 | Página de prompt | ✅ `/comando` |
>
> Os itens 4 e 5 já estavam feitos quando esta auditoria foi lida — entraram nos
> commits `fbe519f`/`57dec8c`, posteriores à base dela.
>
> **Anexo:** #3 (`.dev.vars`) e #5 (código morto) resolvidos. **#1 continua
> exigindo ação humana:** os segredos saíram do `nuxt.config.ts`, mas seguem no
> histórico do git desde `fc50272` — rotacionar é obrigatório. #2 corrigido no
> `wrangler.jsonc` e no default do `nuxt.config.ts`. #6 (Playwright sem E2E)
> segue aberto.
>
> Achados novos, fora desta auditoria: `requireOwner` devolvia **403 para todo
> mundo** (o `role` nunca esteve no objeto de sessão do better-auth), e
> `tests/integration/helpers.ts` usava `credentialId` onde o schema diz
> `credentialID`, derrubando 15 testes em silêncio. Os dois foram corrigidos.

**Data:** 2026-08-21
**Base:** commit `53abe50` (2026-08-17)
**Método:** auditoria de código. Cada afirmação abaixo foi verificada no repositório e vem com o caminho `arquivo:linha`. Não é auditoria de produto — não avalia se a feature está boa, só se existe.

## Por que este documento existe

A última planning definiu 10 itens e **nunca foi persistida em disco**. Não está em `docs/`, nem nos planos, nem em transcript nenhum: foi falada em conversa e se perdeu. A lista chegou a esta auditoria marcada com ❌ em todos os 10 itens.

A auditoria mostrou que **4 dessas marcações estão erradas**: um item está pronto, três estão parcialmente construídos com fundação sólida. Sem corrigir o placar, o próximo plano reconstruiria coisa que já existe — links de agendamento, calendário por hora, aba de atrasados — e subestimaria o que de fato falta.

**A partir daqui, este documento é a fonte da verdade da planning.** Ele é o insumo do próximo plano.

---

## Placar

| # | Item | Marcado | Real | Esforço |
|---|---|---|---|---|
| 1 | [Compartilhamento de agenda / disponibilidade](#1-compartilhamento-de-agenda--disponibilidade-) | ❌ | 🟡 **~60% pronto** | M |
| 2 | [Conteúdo onboarding "comandos"](#2-conteúdo-onboarding-comandos-) | ❌ | ❌ confirmado | M |
| 3 | [Landing page](#3-landing-page-) | ❌ | ✅ **FEITO** | — |
| 4 | [Ver atraso no calendário](#4-organização-por-data-e-hora--ver-atraso-no-calendário-) | ❌ | 🟡 calendário pronto, atraso não | P |
| 5 | [Agenda de atrasados + alarme](#5-agenda-de-atrasados--alarme-) | ❌ | 🟡 existe, travada em 7 dias | P / G |
| 6 | [Passo a passo de hospedagem](#6-passo-a-passo-de-hospedagem--setup-pós-download-) | ❌ | ❌ confirmado | M |
| 7 | [Plugar Claude no Comando](#7-plugar-claude-no-comando-) | ❌ | ❌ confirmado (zero código) | M–G |
| 8 | [Plugar SUAT](#8-plugar-suat-) | ❌ | ⏸️ adiado | — |
| 9 | [IA preenchendo os campos da tarefa](#9-ia-preenchendo-os-campos-da-tarefa-) | ❌ | ❌ confirmado | M |
| 10 | [Página de prompt](#10-página-de-prompt-que-alimenta-o-comando-) | ❌ | ❌ confirmado | G |

Escala de esforço: **P** ≤ 1 dia · **M** 2–4 dias · **G** > 1 semana.

Leia também o [anexo de achados fora da planning](#anexo--achados-fora-da-planning) — os dois primeiros são mais urgentes que qualquer item da lista.

---

## 1. Compartilhamento de agenda / disponibilidade 🟡

> *"permitir compartilhar minha agenda com alguém de forma que essa pessoa veja apenas os slots ocupados (sem o conteúdo), conseguindo enxergar os slots livres pra marcar algo comigo. A agenda aceita tem que virar tarefa. Tem que ir um e-mail pra pessoa que enviou. Se eu editar. Se ela não aceitar, ela nega no e-mail e a tarefa é cancelada."*

### Existe hoje

Um sistema completo de links públicos de agendamento — um "Calendly de tarefas" — entregue no commit `d1d705e` (24/06).

- **Modelo:** `server/db/schema/booking.ts` — `bookingLinks` (`token` único, `availability jsonb` com janelas semanais + timezone, `defaultDurationMinutes`, `active`) e `bookingRequests` (`status` pending/accepted/rejected, `decisionMessage`, `createdTaskId`). Migrations `0024_common_whiplash.sql` e `0025_windy_donald_blake.sql`.
- **O núcleo do free/busy já existe:** `computeOpenSlots()` em `server/utils/bookingService.ts:66` gera os slots das janelas e remove os que colidem com (a) solicitações já aceitas e (b) **qualquer tarefa do dono com `scheduledDate` + `scheduledTime`**, respeitando `durationMinutes`. Ou seja, **a agenda real já é consultada e projetada como "ocupado" sem expor título nem conteúdo**.
- **Privacidade explícita:** `getPublicBookingLink()` (`bookingService.ts:227`) monta um payload mínimo, com comentário no código dizendo que não expõe owner nem token.
- **Superfícies:** página pública `app/pages/agendar/[token].vue` (wizard `select` → `details`, layout `app/layouts/booking.vue`), componentes `BookingCalendar.vue`, `BookingSlots.vue`, `BookingAvailabilityEditor.vue`; painel do dono em `app/pages/agendamentos.vue` com abas Pendentes/Aceitas/Recusadas.
- **Aceitar e recusar existem**, com mensagem opcional: `decideBookingRequest()` (`bookingService.ts:390`), flip atômico `WHERE status='pending'`.
- ✅ **"A agenda aceita vira tarefa" — já implementado.** `bookingService.ts:416-442`: no aceite, dentro da mesma transação, chama `createTask()` com título, data, hora e duração, anexa os dados do solicitante na descrição e grava o id em `bookingRequests.createdTaskId`.
- ✅ **E-mail nos dois sentidos — já implementado** via Resend (`server/utils/mailer.ts`): avisa o dono da nova solicitação (`server/api/booking/[token]/request.post.ts:37`) e avisa o solicitante do aceite/recusa (`server/api/booking-requests/[id]/decision.post.ts:32`).
- Endpoints públicos com rate limit por IP; rota liberada no `app/middleware/auth.global.ts` (`PUBLIC_PREFIXES` inclui `/agendar/`).

### Falta

1. **A visão pedida está invertida.** O pedido é "ver os slots **ocupados**"; o que existe é uma **lista de horários livres, um dia por vez**, restrita às janelas configuradas (ou 08:00–20:00 no modo livre, `FREE_DAY_WINDOWS` em `bookingService.ts`). Não há calendário mostrando blocos "Ocupado" anonimizados.
2. **Compartilhar com uma pessoa específica não existe.** Hoje é um link aberto por token — quem tiver a URL entra. Não há tabela de shares, nem permissão por pessoa, nem revogação individual.
3. **Negar pelo e-mail não existe.** A decisão só acontece logada, no painel. O e-mail enviado ao solicitante é informativo e não tem link de ação.
4. **"Se eu editar" não existe.** Nenhum fluxo notifica o solicitante nem pede reconfirmação quando o dono remarca um agendamento já aceito.
5. **Recusa depois do aceite não cancela a tarefa.** O flip é `WHERE status='pending'`, então uma recusa posterior nem acontece — e a tarefa criada no aceite fica órfã se o agendamento cair por outro caminho.

### Reuso

- `server/utils/invitationService.ts` é o molde exato para os **links de ação no e-mail**: token de 32 bytes, só o sha256 vai pro banco, TTL de 7 dias, uso único, `acceptInvitation()` com flip atômico.
- `decideBookingRequest()` já tem toda a mecânica de decisão + criação de tarefa + e-mail; a ação por e-mail pode virar mais um caminho de entrada pra ela, não uma reimplementação.
- Para "compartilhar com uma pessoa": `server/utils/boardMembersService.ts` + o 4º ramo EXISTS de `taskFilter()` em `server/utils/accessFilter.ts` são o padrão maduro de "compartilhar com pessoa que tem conta vinculada" (`people.linked_user_id`), já usado pelos quadros.
- `BookingAvailabilityEditor.vue` já resolve a edição de janelas semanais e timezone.

### Decisões em aberto

- Link público anônimo, share direcionado a uma pessoa, ou os dois? São modelos de permissão diferentes.
- Granularidade do bloco "Ocupado" — blocos reais com duração, ou faixas arredondadas de 30 min?
- Recusa pós-aceite: arquiva a tarefa (`archived`) ou deleta?
- O link de negar por e-mail é uso único e expira junto com o agendamento?

**Esforço: M**

---

## 2. Conteúdo onboarding "comandos" ❌

### Existe hoje

Uma única tela: `app/pages/onboarding/passkey.vue` — cadastro de passkey no primeiro acesso, com botão "Agora não". É roteada a partir de `app/pages/login/index.vue:71,96` quando o usuário tem zero passkeys, e liberada no middleware (`auth.global.ts:11`).

Nada além disso: sem tour guiado, sem checklist de primeiros passos, sem coach marks, sem flag `hasCompletedOnboarding` no schema. Depois da passkey o usuário cai direto no board vazio de `/trabalho`. O que existe de "vazio guiado" é o componente genérico `app/components/base/BaseEmptyState.vue`.

> O `session_kind = 'onboarding'` no banco (migration `0003`, usado em `server/utils/approvalDecide.ts:64`) é sessão temporária de aprovação de dispositivo — **não** tem relação com onboarding de produto.

### Falta

Tudo. Mas há um achado que muda o escopo do item antes de qualquer código:

> ⚠️ **"Comando" não existe como conceito de UI no app.** É apenas o nome do produto (marca, domínio `comandos.app`, headlines da landing). Não há paleta de comandos, entidade "comando", nem DSL. A metáfora real do app são os **horizontes de tempo** — 7/30/60/90 dias + Micro + Hibernando — documentada em `docs/documentacao-funcional.md` e `docs/tarefas-criar-mover-editar.md`.

Ou seja: "conteúdo onboarding comandos" exige antes decidir **o que se ensina**. Os candidatos reais são os horizontes, os dois eixos Trabalho e Vida, os tipos de tarefa (CEO/Delegado/Pessoal) e a delegação.

### Reuso

`BaseEmptyState.vue` para estados vazios instrutivos; o roteamento pós-login de `login/index.vue:71,96` como ponto de entrada; `docs/documentacao-funcional.md` como matéria-prima do conteúdo.

### Decisões em aberto

- Tour interativo, tela única de boas-vindas, ou empty states que ensinam no contexto?
- Ensina os horizontes ou o eixo Trabalho/Vida primeiro?
- Onboarding com dados de exemplo (existe `pnpm db:seed:demo`) ou board vazio?

**Esforço: M** — o custo está na definição do conteúdo, não no código.

---

## 3. Landing page ✅

**Feito** no commit `a90cbf8` (16/08). Estava marcado como ❌ na planning.

- `app/pages/index.vue` — 1.131 linhas, layout `public`. Header sticky, hero com mock animado do board, blocos de diferenciais/showcase/features, faixa de CTA, footer. Paleta própria (rosa + violeta), deliberadamente distinta do app.
- `app/layouts/public.vue` — shell com mesh de blobs.
- Pré-renderizada estaticamente: `nuxt.config.ts:105-110` → `routeRules: { "/": { prerender: true } }`.
- Pública no middleware (`auth.global.ts:11`) e com redirect client-side pra `/trabalho` quando há sessão válida (`isAuthMarkerValid()`, `app/lib/authMarker.ts`).

**Ficou de fora — sem ter sido pedido**, registrado só para decisão futura: pricing/planos, signup público (o CTA leva ao `/login`, que é OTP por e-mail), termos e privacidade, blog, depoimentos.

---

## 4. Organização por data e hora / ver atraso no calendário 🟡

> *"não consigo ver no calendário se uma tarefa atrasou ou está em dia"*

### Existe hoje

O calendário está maduro e a organização por data **e hora** já funciona.

- **Modelo:** `server/db/schema/tasks.ts` — `scheduledDate` (date), `scheduledTime` (time), `durationMinutes`, `followupDate`, `done`, `completedAt`. Índice `tasks_scheduled_idx`. Não existe coluna `due_date`: o vencimento é derivado de `scheduledDate ?? followupDate`.
- **Lógica:** `app/composables/useAgendaTimeline.ts` — views `day`/`week`/`month`, `collect(from,to)`, `sortEvents()` (com hora antes de sem hora). 100% client-side sobre o cache offline. Espelho no servidor em `server/utils/agendaService.ts` (`listAgenda`), escopado por `taskFilter`.
- **Superfície:** `app/pages/agenda.vue` com 5 modos (`modeTabs:55-61`) — Mês, Semana, Dia, Linha do tempo (Gantt) e Atrasados — mais filtros por tipo, empresa, busca e "mostrar concluídas".
- `app/components/agenda/AgendaCalendar.vue` — grade **por hora** de 7h às 22h, zoom por pinch/ctrl+wheel, linha do "agora", **arrastar para reagendar**.
- `AgendaMonth.vue` (grade 6×7), `AgendaTimeline.vue` (Gantt), `AgendaEventCard.vue` (linguagem visual única dos eventos).

### Falta

**Nenhum indicador de atraso no calendário.** Verificado:

- `AgendaEventCard.vue:27` — `tone` é o **tipo** da tarefa (`ceo`/`delegate`/`personal`/`fup`). A linha 52 aplica `:class="[variant, tone, { done: event.task.done }]"`: nada de atraso. `.evc.done` (linha 251) só reduz opacidade.
- `AgendaMonth.vue` esmaece a **célula do dia** passado, não o evento atrasado dentro dela.
- `AgendaCalendar.vue` e `AgendaTimeline.vue` só marcam `today` e `weekend`.

O único lugar do app que destaca atraso por tarefa é a **lista**, não o calendário: `app/components/tarefas/ListView.vue:159` aplica a classe `.overdue`.

### Reuso

`isOverdue()` e `dueOf()` em `app/components/tarefas/ListView.vue:68-72` — a regra já está escrita e rodando em produção:

```ts
function isOverdue(t: Task): boolean {
  const d = dueOf(t)
  if (!d || t.done) return false
  return d < new Date().toISOString().slice(0, 10)
}
```

Falta extraí-la para um lugar compartilhado e aplicá-la em `AgendaEventCard`.

### Decisões em aberto

- **Cor própria vs badge/ícone.** A cor do card já carrega o *tipo* da tarefa — usar cor pra atraso também cria conflito de canal visual. Um badge, borda ou ícone provavelmente resolve melhor.
- Evento de followup (`kind: 'followup'`) conta como atrasado, ou só o `scheduled`?
- "Em dia" precisa de marca própria, ou basta a ausência da marca de atraso?

**Esforço: P**

---

## 5. Agenda de atrasados + alarme 🟡

> *"agenda de atrasados (visão 7 dias ou mais de 7 dias — filtro), colocar um alarme na agenda pra informar que tem coisa atrasada"*

### Existe hoje

A visão de atrasados existe em dois lugares:

- **Agenda:** aba "Atrasados" (`app/pages/agenda.vue:60`) renderizando `app/components/agenda/AgendaOverdue.vue` — agrupa por dia com rótulos "ontem" / "há N dias" em cor de perigo, com empty state próprio.
- **Trabalho:** view `hatrasados` (`app/pages/trabalho.vue:229`), alimentada por `overdueTasks()` (`trabalho.vue:353`).

### Falta

**1. A janela é fixa em 7 dias — e o resto some em silêncio.**

`useAgendaTimeline.ts:155-160`:

```ts
// Atrasados: eventos ativos (não concluídos) cuja data caiu nos últimos 7 dias
const overdueEvents = computed<TimelineEvent[]>(() => {
  const t = today()
  const from = fmtDate(addDays(t, -7))
  const to = fmtDate(addDays(t, -1))
  return collect(from, to).filter((e) => !e.task.done)
})
```

O filtro é um intervalo `[hoje−7, ontem]`, não `d < hoje`. **Tudo que atrasou há mais de 7 dias desaparece das duas visões sem aviso** — exatamente o oposto do que se espera de uma tela de atrasados. `trabalho.vue:353` tem a mesma janela fixa. Não existe a faixa "mais de 7 dias" nem seletor de range.

**2. O alarme não existe para tarefas.**

- `app/layouts/default.vue:67-68` declara `alert?: number` no item de navegação, renderizado como `.nav-alert` nas linhas 360 e 480.
- **O único uso de `alert` é Pagamentos** (linhas 104-105), via `usePayments().summary.overdueCount`.
- A Agenda (linha 84) usa `count: agendaCount` — total de tarefas com data, **sem distinguir atrasadas**.
- **Zero notificação, push ou alarme em todo o projeto.** Sem Push API no PWA, sem VAPID, sem cron/scheduled worker no `wrangler.jsonc`. Grep por `Notification`, `webpush`, `alarm`, `lembrete`, `reminder` retorna só comentários soltos.

### Reuso

O padrão completo já existe em Pagamentos e é replicável quase 1:1:
- badge de alerta no nav — `app/layouts/default.vue:104-105`
- banner vermelho na página — `app/pages/pagamentos.vue:295-305`
- KPI negativo — `app/pages/trabalho.vue:602-604`

Para o range, `useAgendaTimeline.ts` já tem toda a mecânica de `range`/`offset` a ser generalizada.

### Decisões em aberto

- **"Alarme" significa o quê?** Badge in-app (P), e-mail diário (M), ou push do navegador (G — exige Push API + VAPID + provavelmente um cron worker, já que o Worker só roda por request)?
- O filtro é um seletor de range livre ou faixas fixas (7 dias / 30 dias / tudo)?
- Atrasado sem data de followup e atrasado por followup entram na mesma lista?

**Esforço: P** para o range + badge · **G** se o alarme for push de verdade.

---

## 6. Passo a passo de hospedagem / setup pós-download ❌

### Existe hoje

- `README.md` — cobre bem o **dev local** (`pnpm install`, `.env`, `pnpm dev`, Postgres via Docker) e a arquitetura offline-first. A seção `## Deploy` tem **uma linha**: *"Cloudflare Workers + Railway Postgres. Veja `wrangler.jsonc` e o plano."*
- `workers/sync/README.md` — **o único passo a passo de deploy real do repositório** (4 passos para o worker de sync).
- `docs/apresentacao/producao.md` — setup local para gravar o webinar; é o que mais chega perto de um "setup pós-download".
- `wrangler.jsonc` — a configuração real de produção, mas sem nada que explique como reproduzi-la.

### Falta

Não existe `DEPLOY.md`, `INSTALL.md` nem `SETUP.md`. Não existe `.github/` — o CI/CD planejado no Milestone K (`docs/superpowers/plans/2026-04-23-comando-phase1.md:5667-5830`) nunca foi executado, e o deploy é 100% manual via `pnpm deploy:cloudflare`.

Nada documentado sobre:

| Assunto | Detalhe |
|---|---|
| Hyperdrive | ID chumbado no `wrangler.jsonc`; sem instrução de como criar |
| KV `HQ_BG_CACHE` | ID chumbado; é o `secondaryStorage` do better-auth (`server/utils/auth.ts:15`) |
| Banco Railway | Como provisionar e obter a connection string |
| Migrations em produção | `pnpm db:migrate` roda contra `DATABASE_URL` local; ninguém diz que em prod é preciso rodar contra o Railway **antes** do `wrangler deploy` |
| Chaves S3 | Nunca citadas como `wrangler secret`. Sem elas, `/api/attachments/*` quebra (`server/utils/storage.ts:35`) |
| Resend | Criar conta, verificar domínio, SPF/DKIM/DMARC do subdomínio de envio (`comando@updates.brunnogalvao.com.br`) |
| DNS / domínio próprio | Adicionar a zona, apontar nameservers, `custom_domain` |
| Primeiro admin | O bootstrap só aparece dentro do plano da Fase 1, como UPDATE SQL manual |

> 🔴 **Armadilha crítica a documentar: trocar de domínio invalida todas as passkeys existentes.** `SITE_URL` vira o `expectedOrigin`/rpID do WebAuthn, e há uma allowlist hardcoded em `server/utils/auth.ts:35`. Quem migrar de domínio sem saber disso derruba o login de todo mundo.

**14 das 26 variáveis de ambiente não estão no `.env.example`** — incluindo `SYNC_TOKEN_SECRET` e `NUXT_PUBLIC_SYNC_URL`, sem as quais o tempo real simplesmente não liga.

#### Inventário completo de variáveis

**Documentadas em `.env.example` (12):**

| Variável | Onde é lida |
|---|---|
| `DATABASE_URL` | `drizzle.config.ts:8`, `scripts/seed-*.ts`, `tests/integration/helpers.ts` — build-time e scripts; o runtime usa Hyperdrive |
| `AUTH_SECRET` | `runtimeConfig.authSecret` → `server/utils/auth.ts:24` |
| `RESEND_API_KEY` | `server/utils/mailer.ts:7,17` |
| `RESEND_FROM_EMAIL` | `server/utils/mailer.ts:11,21` |
| `ADMIN_BOOTSTRAP_EMAIL` | `runtimeConfig.adminBootstrapEmail` |
| `SITE_URL` | `runtimeConfig.public.siteUrl` → `auth.ts:20` (**expectedOrigin do WebAuthn**), `invitationService`, links de convite e booking |
| `S3_ENDPOINT` · `S3_REGION` · `S3_BUCKET` · `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` · `S3_PUBLIC_BASE_URL` | `server/utils/storage.ts:17-31` |

**NÃO documentadas (14):**

| Variável | Onde é lida | Documentada em |
|---|---|---|
| `SYNC_TOKEN_SECRET` | `server/api/sync/token.get.ts:17`, `workers/sync/src/index.ts:80` | só `workers/sync/README.md` |
| `NUXT_PUBLIC_SYNC_URL` | `runtimeConfig.public.syncUrl` | só `workers/sync/README.md` |
| `BETTER_AUTH_URL` | consumido pelo better-auth; `wrangler.jsonc:26` | comentário em `auth.global.ts:33` |
| `BETTER_AUTH_TELEMETRY` | script `deploy:cloudflare` | nenhum lugar |
| `NUXT_DEMO_BYPASS` | `runtimeConfig.demoBypass` → `server/api/auth/demo-login.post.ts:20` | `docs/apresentacao/producao.md:19` |
| `NUXT_PUBLIC_DEMO_MODE` | `runtimeConfig.public.demoMode` | `docs/apresentacao/producao.md:18` |
| `NUXT_DEMO_EMAIL` | `runtimeConfig.demoEmail` (default `demo@comando.app`) | `docs/apresentacao/README.md:20` |
| `DEMO_EMAIL` · `DEMO_NAME` | `scripts/seed-demo.ts:23-24` | nenhum lugar |
| `SEED_EMAIL` · `SEED_NAME` · `SEED_ROLE` | `scripts/seed-user.ts:7-9` | nenhum lugar |
| `TEST_DATABASE_URL` | `tests/integration/helpers.ts:14` | nenhum lugar |
| `NODE_ENV` | `server/utils/deviceFingerprint.ts:19` (flag `secure` do cookie) | — |

**Bindings do Cloudflare** (não são env vars, mas são pré-requisito de infra e também não estão documentados): `HYPERDRIVE`, `HQ_BG_CACHE` (KV), `SYNC` (service binding), `ASSETS`, e `SYNC_ROOM` (Durable Object, no worker de sync).

### Reuso

`workers/sync/README.md` é o modelo de formato — curto, numerado, executável. A seção "Production deploy" rascunhada no Milestone K (`plans/2026-04-23-comando-phase1.md:5795-5804`) tem o esqueleto, mas está **desatualizada** (fala em `wrangler.toml`; hoje é `wrangler.jsonc`).

### Decisões em aberto

- O doc é "como **eu** reimplanto" ou "como **outra pessoa** sobe a própria instância"? Muda tudo — a segunda opção exige parametrizar IDs de Hyperdrive/KV hoje chumbados.
- Entra CI/CD (GitHub Actions) ou o deploy segue manual?
- Um `DEPLOY.md` na raiz ou uma seção expandida do README?

**Esforço: M**

---

## 7. Plugar Claude no Comando ❌

### Existe hoje

**Nada.** Verificado exaustivamente:

- `package.json` — nenhuma dependência de IA. Nada de `@anthropic-ai/*`, `openai`, `ai`, `@ai-sdk/*`, `langchain`. Confirmado também no `pnpm-lock.yaml`.
- `server/api/**` (~110 endpoints) — nenhuma rota de chat, completion ou IA.
- `.env.example`, `.dev.vars`, `wrangler.jsonc`, `server/types/env.d.ts` — nenhuma chave de LLM; nenhum binding de Workers AI ou Vectorize.
- Nenhum MCP, nenhum `.mcp.json`, nenhum `CLAUDE.md` no repositório.

As únicas ocorrências de "Claude" no repo são linhas de autoria em specs (`docs/superpowers/specs/2026-04-23-comando-design.md:4`).

### Decisões em aberto — este item não é planejável como está

> ⚠️ **"Plugar Claude" tem pelo menos quatro leituras, e são quatro produtos diferentes:**
> 1. **Chat sobre as tarefas** — conversar com a base (é o item 10)
> 2. **Classificador de campos** — preencher tipo/horizonte/área automaticamente (é o item 9)
> 3. **Agente que executa ações** — criar, mover, delegar tarefas via linguagem natural
> 4. **MCP server** — expor o Comando como ferramenta pro Claude Desktop/Code, sem UI nova
>
> A opção 4 é de longe a mais barata e não exige nenhuma UI. Os itens 9 e 10 desta planning dependem desta decisão.

Notas de arquitetura para quem for planejar:

- Rodando em Cloudflare Workers, a chamada ao LLM precisa de **streaming** (limite de CPU por request) e de cuidado com o `Pool({ max: 1 })` criado **por request** em `server/utils/db.ts`, fechado no `afterResponse` — uma chamada longa segura a conexão.
- O modelo atual da Anthropic para este uso seria a família Claude 5 (`claude-sonnet-5` como padrão de custo/qualidade).
- A chave precisa ser `wrangler secret`, nunca `runtimeConfig` default — ver anexo #1.

**Esforço: M–G**, conforme a leitura escolhida.

---

## 8. Plugar SUAT ⏸️

**Adiado por decisão do usuário nesta auditoria** ("não é para agora").

Estado factual: zero menções a "SUAT" em todo o repositório — código, docs, mensagens de commit. Nenhum documento define o que é ou o que "plugar" significa neste contexto.

Perguntas a responder **antes** de qualquer planejamento:

- O que é SUAT e o que ele faz?
- Direção da integração: o Comando chama o SUAT, o SUAT chama o Comando, ou os dois?
- Qual o modelo de auth entre os dois?
- Que dados atravessam a fronteira?

---

## 9. IA preenchendo os campos da tarefa ❌

> *"IA para preencher se a tarefa é pessoal, empresa etc. Preencher os campos e subcampos sozinha. Na dúvida, inclusive, ela pode perguntar pra ele."*

### Existe hoje

Os campos-alvo existem no schema e são **100% manuais**.

`server/db/schema/tasks.ts`:
- `type` — enum `task_type`: `ceo` | `delegate` | `personal` (default `ceo`)
- `horizon` — `core7` | `core30` | `core60` | `core90` | `hibernating` (default `core30`)
- `isMicro` (boolean)
- `lifeArea` — enum `life_area`: `corpo` | `mente` | `relacionamentos` | `recursos` | `experiencias` (definido em `server/db/schema/life.ts`)
- `lifeItemId`, `projectId`, `goalId`, `companyId`, `delegatePersonId`

O que existe de "automático" hoje são **regras fixas**, não classificação:
- Pré-seleção do assistente quando só existe um cadastrado — `app/components/tarefas/TaskModal.vue:258-262`
- `defaults` / `preset` por coluna (o "+" de uma coluna já traz o horizonte dela) — `TaskModal.vue:59,81,318-320`
- Resolução automática do assistente ao converter a tarefa para `personal` — `server/utils/tasksService.ts:677-678`

### Falta

- **`app/components/tarefas/InboxQuick.vue` é um `<input>` + toggle "Micro", sem nenhum parsing.** Emite `submit(title, isMicro)` cru — não detecta data, hora, pessoa, projeto, empresa nem área de vida.
- Nenhum fluxo pergunta ao usuário para desambiguar (a parte do "na dúvida ela pode perguntar").
- Os autocompletes existentes (`PessoaAutocomplete.vue`, `CompanyAutocomplete.vue`) são filtro de string sobre lista local — não são sugestão.

### Reuso

A regra determinística "projeto/meta com categoria `personal` ⇒ `lifeArea` obrigatória" (`server/utils/projectsService.ts:75-77,152-157` e `goalsService.ts:59-61`) já define parte da validação que qualquer preenchimento automático teria que respeitar — vale reaproveitar como guarda, não reescrever.

### Decisões em aberto

- **Sugerir-e-confirmar ou preencher direto?** Preencher direto em campo errado é pior que campo vazio.
- Onde roda: no cliente (`InboxQuick`) ou no servidor (`POST /api/tasks`)?
- ⚠️ **Colisão com o offline-first.** A tarefa é criada com id gerado no **cliente** e vai pra outbox (`app/lib/offlineQueue.ts`); o servidor honra esse id. Uma classificação que bloqueie a criação quebra a captura rápida e o uso offline. A classificação precisa ser **assíncrona e pós-sync** — enriquece a tarefa depois, nunca segura a criação.
- Reclassifica tarefas antigas em lote, ou só as novas?

**Esforço: M**

---

## 10. Página de prompt que alimenta o Comando ❌

> *"página de prompt que alimenta os comandos. Ela recebe as tarefas, pergunta, preenche, responde com o que está rolando etc."*

### Existe hoje

Nada. Nenhuma página, componente, store ou rota de chat, prompt ou conversa. As 25 páginas de `app/pages/` estão inventariadas e nenhuma é disso.

> ⚠️ **Falso positivo importante para quem for auditar depois:** o app usa muito a palavra **"assistente"**, mas é sempre uma **pessoa humana** — `app/composables/usePeople.ts:9,54,90-101` (`isAssistant`, `setAssistant`), `server/api/people/[id]/assistant.post.ts`, `app/pages/settings/people.vue`. Não confundir com assistente de IA.

O mais próximo de um command palette é a **busca global**: `app/components/topbar/BuscaGlobal.vue` + `app/composables/useGlobalSearch.ts` — atalho `Cmd/Ctrl+F`, navegação por setas, busca acento-insensível sobre tarefas, projetos, empresas, pagamentos, notas e pessoas, com cada resultado carregando um `run()`.

### Reuso

`useGlobalSearch.ts` já tem a estrutura que um palette conversacional precisaria: overlay, atalho de teclado, lista de resultados acionáveis com `run()`. A camada de intenção entraria por cima disso, não do zero.

### Depende de

**Item 7.** Não dá pra planejar esta página antes de decidir qual é a integração de LLM. Se a resposta do item 7 for "MCP server", este item pode deixar de existir — o Claude Desktop vira a interface.

**Esforço: G**

---

## Anexo — achados fora da planning

Encontrados durante a auditoria, ordenados por gravidade. **Os dois primeiros são mais urgentes que qualquer item da planning.**

### 🔴 1. Segredos reais commitados no repositório

Em **dois** lugares:

- `nuxt.config.ts:135-136` — `authSecret` e `resendApiKey` reais como *defaults* de `runtimeConfig`. Por serem defaults, **vão para o bundle do worker** e valem sempre que o secret não estiver setado no ambiente.
- `.dev.vars` — **está versionado no git desde o commit inicial `fc50272`** e contém um segundo `AUTH_SECRET` real (diferente do anterior; a `RESEND_API_KEY` ali é fake).

Ação: rotacionar os dois `AUTH_SECRET` e a chave do Resend, zerar os defaults do `runtimeConfig`, passar tudo a `wrangler secret`. Rotacionar o `AUTH_SECRET` invalida as sessões ativas — planejar a janela.

### 🔴 2. `SITE_URL` aponta para o domínio errado

`wrangler.jsonc:27` define `SITE_URL = https://hq-brunno-galvao.gitlab-admin-company.workers.dev`, mas o domínio real da aplicação é `comandos.app` (`custom_domain: true` no mesmo arquivo). O mesmo valor está em `nuxt.config.ts` (`runtimeConfig.public.siteUrl`).

`SITE_URL` é o `expectedOrigin`/rpID do WebAuthn **e** a base dos links de convite e de agendamento. Quem acessar por `comandos.app` recebe links apontando pro `workers.dev` e desafios de passkey com origem divergente.

> Cuidado ao corrigir: mudar o rpID **invalida as passkeys já cadastradas** (ver item 6).

### 🟠 3. `.dev.vars` fora do `.gitignore`

O `.gitignore` cobre `.env` e `.env.*`, mas **não** `.dev.vars` — que é justamente o arquivo de secrets locais do Wrangler. Por isso ele foi commitado (#1). Adicionar ao `.gitignore` e remover do índice.

### 🟡 4. 14 variáveis de ambiente não documentadas

Tabela completa no [item 6](#6-passo-a-passo-de-hospedagem--setup-pós-download-). Duas delas — `SYNC_TOKEN_SECRET` e `NUXT_PUBLIC_SYNC_URL` — são obrigatórias para o tempo real funcionar, e só aparecem no README do worker de sync.

### 🟡 5. Código morto na agenda

Sem nenhuma referência viva em `app/` ou `server/` (verificado incluindo auto-import do Nuxt):
- `app/components/agenda/AgendaGrid.vue`
- `app/components/agenda/MiniCalendar.vue`
- `app/composables/useAgenda.ts` — importado só por `AgendaGrid.vue`, e só para tipos

Vale remover antes de mexer na agenda (itens 4 e 5), pra não gastar esforço em componente morto.

### 🟡 6. Playwright instalado, E2E inexistente

O Playwright está nas dependências, mas não há `playwright.config.ts` nem `tests/e2e/`. Os testes E2E do Milestone K nunca saíram do papel. O que roda hoje é Vitest: 24 testes de integração + 11 unitários.

### ⚪ 7. Arquivos soltos não rastreados

`features_fixed.png` e `test-fetch.ts` na raiz do working tree. Decidir: commitar, mover ou apagar.

---

## Recomendação de sequenciamento

Proposta para o próximo plano — não é o plano.

**Antes de tudo (custo baixo, risco alto):** anexo #1, #2 e #3. São horas de trabalho e destravam qualquer publicação do repositório ou troca de domínio.

**Depois, em ondas:**

1. **Itens 4 + 5** — ambos P, no mesmo código de agenda, e resolvem a queixa mais concreta da lista ("não vejo o que atrasou"). Limpar o anexo #5 junto. Deixar o alarme na versão badge; push fica pra depois.
2. **Item 1** — fechar o ciclo de e-mail (negar pelo link, avisar na edição, cancelar a tarefa). A fundação já está pronta; é a maior relação valor/esforço da lista.
3. **Item 6** — a documentação de hospedagem, que também consolida o que foi corrigido no anexo #2.
4. **Item 2** — onboarding, depois de decidir o que se ensina.
5. **Trilha de IA — 7 → 9 → 10, nessa ordem.** O item 7 é uma decisão de produto, não de código; os itens 9 e 10 só ficam planejáveis depois dela. O item 8 volta quando houver definição.

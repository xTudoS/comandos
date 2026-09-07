# Comando Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP of Comando — auth with passkeys + trust-device (with cryptographic approval signatures), tasks with delegation across workspaces, agenda, polymorphic audit with in-task timeline, and the protótipo UI ported — deployed to Cloudflare Workers.

**Architecture:** Nuxt 4 with Nitro `cloudflare-module` preset. Drizzle ORM over `pg` via a Cloudflare Hyperdrive binding, with the `db` instance created **per request** (never as a module-level singleton). better-auth provides passkey + emailOTP; device approval is a custom layer on top, with WebAuthn step-up producing non-repudiable signatures stored in `audit_log`. Backend code and schema in English; UI strings in Portuguese.

**Tech Stack:** pnpm · Nuxt 4 · Nuxt UI v3 · TanStack Vue Query · Drizzle ORM · `pg` · Cloudflare Workers (Hyperdrive binding) · Railway Postgres · Resend · better-auth · Vitest · Playwright.

**Spec:** `docs/superpowers/specs/2026-04-23-comando-design.md` — read first.

---

## Overview

The plan has 36 tasks grouped into milestones. Tasks are ordered by dependency. Each task is a self-contained slice that, when complete, leaves the repo in a compiling and (where applicable) testable state. Commit after every task.

### Milestones

| # | Milestone                                  | Tasks  |
|---|--------------------------------------------|--------|
| A | Repo & Nuxt infra                          | 1–4    |
| B | Database foundation                        | 5–6    |
| C | Auth core (passkey + emailOTP + bootstrap) | 7–9    |
| D | Trust-device with signed approvals         | 10–14  |
| E | Audit log + timeline                       | 15–17  |
| F | People, invitations, assistant             | 18–21  |
| G | Tasks, checklist, annotations              | 22–27  |
| H | Agenda                                     | 28     |
| I | UI portada do protótipo                    | 29–32  |
| J | Settings, admin, rate limit                | 33–35  |
| K | Deploy + smoke E2E                         | 36     |

### Ground rules

- **TDD**: write failing test → verify fail → minimal implementation → verify pass → commit. Every task follows this cadence.
- **DRY + YAGNI**: helpers (`useDb`, `accessFilter`, `auditedUpdate`, `verifyApprovalAssertion`) live in exactly one place and are reused.
- **Commits are frequent**: one per task at minimum.
- **No `db.update(table)` outside `server/utils/audit.ts`** — enforced by custom ESLint rule in Task 16.
- **All error responses**: `{ error: { code, message, details? } }` with stable `ERR_*` codes defined per domain.
- **UI language**: all user-visible text in Portuguese. Code, comments, table/column names in English.

---

## File Structure

```
/Users/alexandre/Documents/hq-brunno-galvao/
├── .gitignore
├── .env.example
├── README.md
├── package.json · pnpm-lock.yaml · pnpm-workspace.yaml(no)
├── tsconfig.json · nuxt.config.ts · app.config.ts
├── eslint.config.mjs                  # includes no-raw-db-update custom rule
├── wrangler.toml
├── drizzle.config.ts
├── vitest.config.ts · playwright.config.ts
│
├── docs/superpowers/                  # already exists
│   ├── specs/2026-04-23-comando-design.md
│   ├── plans/2026-04-23-comando-phase1.md
│   └── assets/prototype.html          # Brunno pastes the HTML from the brainstorming message
│
├── app/
│   ├── app.vue
│   ├── assets/css/main.css            # CSS vars ported from protótipo
│   ├── layouts/default.vue · auth.vue
│   ├── pages/
│   │   ├── index.vue                  # redirect → /trabalho
│   │   ├── trabalho.vue · agenda.vue
│   │   ├── pagamentos.vue · projetos.vue · notas.vue · arquivo.vue    # Phase 1 stubs "em breve"
│   │   ├── login.vue
│   │   ├── onboarding/passkey.vue
│   │   ├── login/waiting.vue
│   │   ├── invite/[token].vue
│   │   ├── settings/index.vue · devices.vue · people.vue
│   │   └── admin/users/index.vue · [id].vue
│   ├── components/
│   │   ├── topbar/Topbar.vue · Kpis.vue · BuscaGlobal.vue
│   │   ├── tarefas/TaskCard.vue · TaskModal.vue · HorizonteList.vue · InboxQuick.vue · Checklist.vue · Anotacoes.vue · HistoricoTimeline.vue
│   │   ├── agenda/AgendaGrid.vue · MiniCalendar.vue · AgendaLegend.vue · EventTooltip.vue
│   │   ├── delegacao/PessoaAutocomplete.vue · BadgeDelegado.vue · BadgePendente.vue
│   │   ├── auth/LoginForm.vue · OtpInput.vue · PasskeyPrompt.vue · DeviceApprovalBanner.vue
│   │   └── ui/                         # thin wrappers over Nuxt UI when needed
│   ├── composables/
│   │   ├── useAuth.ts · useTasks.ts · useAgenda.ts · usePeople.ts
│   │   ├── useAudit.ts · useDeviceApprovals.ts · useToast.ts
│   ├── middleware/auth.global.ts · admin.ts
│   └── utils/dates.ts · format.ts · horizontes.ts · escape.ts
│
├── server/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...handler].ts         # better-auth mount
│   │   │   ├── device-approvals/
│   │   │   │   ├── index.get.ts        # pending for current user
│   │   │   │   ├── [id].get.ts         # poll status (requester)
│   │   │   │   ├── [id]/challenge.get.ts
│   │   │   │   └── [id]/decide.post.ts
│   │   │   └── email-otp/
│   │   │       ├── send.post.ts        # custom wrapper with rate-limit
│   │   │       └── verify.post.ts      # custom wrapper with bootstrap guard
│   │   ├── tasks/
│   │   │   ├── index.get.ts · index.post.ts
│   │   │   ├── [id].get.ts · [id].patch.ts · [id].delete.ts
│   │   │   ├── [id]/complete.post.ts
│   │   │   ├── [id]/archive.post.ts
│   │   │   ├── [id]/reassign.post.ts
│   │   │   ├── [id]/reschedules.get.ts
│   │   │   ├── [id]/checklist/index.get.ts · index.post.ts · [cid].patch.ts · [cid].delete.ts
│   │   │   └── [id]/annotations/index.get.ts · index.post.ts · [aid].delete.ts
│   │   ├── agenda/index.get.ts
│   │   ├── people/
│   │   │   ├── index.get.ts · index.post.ts · [id].patch.ts · [id].delete.ts
│   │   │   ├── [id]/invite.post.ts · [id]/assistant.post.ts
│   │   ├── invitations/[token]/accept.post.ts
│   │   ├── audit/index.get.ts
│   │   └── admin/
│   │       ├── users.get.ts
│   │       └── users/[id]/reset-devices.post.ts
│   ├── db/
│   │   ├── schema/auth.ts · people.ts · tasks.ts · audit.ts · index.ts
│   │   └── migrations/                 # drizzle-kit output
│   ├── middleware/00.auth.ts · 01.rateLimit.ts
│   └── utils/
│       ├── db.ts                       # useDb(event)
│       ├── auth.ts                     # better-auth factory
│       ├── accessFilter.ts
│       ├── audit.ts                    # auditedUpdate + diffFields + writeAudit
│       ├── signatureAudit.ts           # decision_payload, canonical json, verify
│       ├── challenges.ts               # short-TTL store (Postgres table)
│       ├── mailer.ts                   # Resend
│       ├── rateLimit.ts
│       ├── deviceFingerprint.ts
│       └── errors.ts                   # ERR_* codes + createApiError
│
├── tests/
│   ├── unit/                           # diffFields, canonicalJson, verifyApprovalAssertion, accessFilter, etc.
│   ├── integration/                    # endpoint tests against test Postgres (pg-mem or testcontainers)
│   └── e2e/                            # Playwright flows
│
└── eslint-rules/
    └── no-raw-db-update.js             # custom rule
```

### Key responsibilities per file

- **`server/utils/db.ts`**: `useDb(event)` returns a Drizzle instance built from `event.context.cloudflare.env.HYPERDRIVE.connectionString`. Never caches.
- **`server/utils/audit.ts`**: the ONLY place in the codebase that calls `db.update(table)` or `db.delete(table)`. Any other call is flagged by the lint rule.
- **`server/utils/accessFilter.ts`**: exports `taskFilter(userId)`, `noteFilter`, `paymentFilter`, etc. — all return Drizzle `SQL<boolean>` expressions to be used in `where()`.
- **`server/utils/signatureAudit.ts`**: `buildDecisionPayload`, `canonicalJson`, `verifyApprovalAssertion`, `writeApprovalAudit`.
- **`server/utils/challenges.ts`**: persisted (Postgres) short-TTL store for WebAuthn challenges, with one-shot consumption. A single table `auth_challenges(id, challenge_hash, payload jsonb, expires_at, consumed_at)`.
- **`app/composables/useDeviceApprovals.ts`**: polls pending approvals every 30s while the tab is visible and exposes `approve(id)` / `reject(id)` that orchestrate the step-up WebAuthn ceremony.

---

## Milestone A — Repo & Nuxt infra (Tasks 1–4)

### Task 1: Initialize git repo + bootstrap docs

**Files:**
- Create: `.gitignore`, `README.md`
- Create: `docs/superpowers/assets/prototype.html` (Brunno pastes the HTML)

- [ ] **Step 1: Initialize git from repo root**

```bash
cd /Users/alexandre/Documents/hq-brunno-galvao
git init
git branch -m main
```

- [ ] **Step 2: Create `.gitignore`**

```
# deps
node_modules
.pnpm-store

# nuxt
.nuxt
.output
.data
dist

# env
.env
.env.*
!.env.example

# cloudflare
.wrangler

# drizzle
drizzle/meta/_journal.json.bak

# test artifacts
coverage
playwright-report
test-results

# os
.DS_Store
Thumbs.db

# editor
.vscode
.idea
```

- [ ] **Step 3: Seed the README**

Create `README.md`:

```markdown
# Comando

Sistema pessoal de comando — tasks, agenda, pagamentos, projetos, notas — multi-usuário com delegação e passkeys.

- Spec: `docs/superpowers/specs/2026-04-23-comando-design.md`
- Plano Fase 1: `docs/superpowers/plans/2026-04-23-comando-phase1.md`
- Protótipo de referência: `docs/superpowers/assets/prototype.html`

## Dev

```bash
pnpm install
cp .env.example .env      # preencha segredos
pnpm dev
```

## Deploy

Cloudflare Workers + Railway Postgres. Veja `wrangler.toml` e o plano.
```

- [ ] **Step 4: Ask Brunno to paste the prototype HTML**

The prototype HTML was shared in the original brainstorming message. Ask Brunno to save the exact content to `docs/superpowers/assets/prototype.html`. If he can't locate it, the engineer can skip this step — the UI tasks reference the prototype semantically, not byte-for-byte.

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md docs/
git commit -m "chore: bootstrap repo, docs, and prototype reference"
```

---

### Task 2: Scaffold Nuxt 4 with pnpm

**Files:**
- Generated by CLI: `package.json`, `nuxt.config.ts`, `app/app.vue`, `tsconfig.json`, etc.

- [ ] **Step 1: Create Nuxt 4 app at repo root**

```bash
pnpm dlx create-nuxt@latest . --package-manager pnpm --git-init false --no-install
```

When prompted, choose Nuxt 4, no devtools opt-out, no example pages (a clean template). If the CLI refuses because the directory isn't empty, run with `--force` or point it at a temp dir and copy the output over, preserving the existing `docs/`, `.gitignore`, `README.md`.

- [ ] **Step 2: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 3: Verify dev server boots**

```bash
pnpm dev
```

Expected: server starts on `http://localhost:3000`, shows "Welcome to Nuxt!" stub. Kill with Ctrl+C.

- [ ] **Step 4: Configure baseline `nuxt.config.ts`**

Replace `nuxt.config.ts` with:

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-04-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },
  typescript: { strict: true, typeCheck: true },
  runtimeConfig: {
    authSecret: '',
    resendApiKey: '',
    resendFromEmail: '',
    adminBootstrapEmail: '',
    public: {
      siteUrl: '',
    },
  },
  nitro: {
    preset: 'cloudflare-module',
    cloudflare: { deployConfig: true, nodeCompat: true },
  },
  app: {
    head: {
      title: 'Comando',
      htmlAttrs: { lang: 'pt-BR' },
    },
  },
})
```

- [ ] **Step 5: Add type-check script**

Edit `package.json` scripts:

```json
"scripts": {
  "dev": "nuxt dev",
  "build": "nuxt build",
  "preview": "nuxt preview",
  "typecheck": "nuxt typecheck",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: scaffold Nuxt 4 app with cloudflare-module preset"
```

---

### Task 3: Add Nuxt UI + port CSS tokens from prototype

**Files:**
- Modify: `nuxt.config.ts`
- Create: `app.config.ts`
- Create: `app/assets/css/main.css`

- [ ] **Step 1: Install Nuxt UI v3**

```bash
pnpm add @nuxt/ui
```

- [ ] **Step 2: Register module in `nuxt.config.ts`**

Add to the `modules` array:

```ts
modules: ['@nuxt/ui'],
css: ['@/assets/css/main.css'],
```

- [ ] **Step 3: Create `app/assets/css/main.css`** with the full CSS variables block from the prototype

```css
:root {
  --bg: #f5f5f7;
  --surface: #ffffff;
  --surface-alt: #fafafa;
  --surface-hover: #f2f2f5;
  --border: #e5e5ea;
  --border-strong: #d1d1d6;
  --text: #1d1d1f;
  --text-2: #515154;
  --text-3: #86868b;
  --text-4: #aeaeb2;
  --accent: #0071e3;
  --accent-hover: #0077ed;
  --accent-soft: #e8f1fd;
  --success: #30a46c;
  --warning: #d97706;
  --danger: #d93141;
  --amber: #b06a00;
  --amber-bg: #fef4e6;

  --ceo-bg: #fff0ee;    --ceo-fg: #c9342a;
  --delego-bg: #e8f5ed; --delego-fg: #1d7a45;
  --pessoal-bg: #fef4e6; --pessoal-fg: #b06a00;

  --core30-bar: #d93141; --core60-bar: #d97706; --core90-bar: #30a46c;
  --micro-bar: #5856d6;  --backlog-bar: #8e8e93; --hibernando-bar: #636366;

  --followup-bg: #fef4e6; --followup-fg: #b06a00;

  --radius: 10px; --radius-sm: 6px; --radius-lg: 14px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-lg: 0 8px 28px rgba(0,0,0,0.12);

  --font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: "SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, monospace;
}

html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 4: Create `app.config.ts`** mapping Nuxt UI primary to the accent

```ts
export default defineAppConfig({
  ui: {
    primary: 'blue',
    gray: 'slate',
    colors: {
      primary: '#0071e3',
    },
  },
})
```

- [ ] **Step 5: Smoke test**

Run `pnpm dev`, open `http://localhost:3000`. The background should be the light grey from `--bg`.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: add Nuxt UI and port prototype CSS tokens"
```

---

### Task 4: Configure Cloudflare Workers deploy (wrangler + Hyperdrive placeholders)

**Files:**
- Create: `wrangler.toml`
- Create: `.env.example`

- [ ] **Step 1: Create `wrangler.toml`**

```toml
name = "comando"
main = ".output/server/index.mjs"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

# Filled in by Brunno with the actual Hyperdrive ID created from the Railway
# Postgres connection string. Locally, `wrangler dev` picks up a local PG
# via the `--hyperdrive` flag (see README).
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "__REPLACE_WITH_HYPERDRIVE_ID__"
localConnectionString = "postgres://postgres:postgres@localhost:5432/comando_dev"

[vars]
SITE_URL = "http://localhost:3000"
RESEND_FROM_EMAIL = "comando@brunno.dev"

# secrets set via: wrangler secret put <NAME>
#   AUTH_SECRET
#   RESEND_API_KEY
#   ADMIN_BOOTSTRAP_EMAIL
```

- [ ] **Step 2: Create `.env.example`**

```
# Local dev secrets. Copy to .env (gitignored).
AUTH_SECRET=change_me_to_a_long_random_string
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=comando@brunno.dev
ADMIN_BOOTSTRAP_EMAIL=brunno.cunha@gmail.com
SITE_URL=http://localhost:3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/comando_dev
```

- [ ] **Step 3: Document local Postgres in README**

Append to `README.md`:

````markdown
## Local Postgres

```bash
docker run -d --name comando-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=comando_dev \
  -p 5432:5432 \
  postgres:16
```
````

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml .env.example README.md
git commit -m "chore: add wrangler config and env template"
```

---

## Milestone B — Database foundation (Tasks 5–6)

### Task 5: Drizzle + pg + per-request DB helper

**Files:**
- Create: `drizzle.config.ts`
- Create: `server/db/schema/index.ts` (empty re-exports for now)
- Create: `server/utils/db.ts`
- Create: `tests/unit/db.test.ts`

- [ ] **Step 1: Install deps**

```bash
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
```

- [ ] **Step 3: Create empty schema index**

`server/db/schema/index.ts`:

```ts
// Re-exports for all schema modules. Populated as tables are added.
export {}
```

- [ ] **Step 4: Write failing test for `useDb`**

`tests/unit/db.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { useDb } from '~/server/utils/db'

describe('useDb', () => {
  it('creates a fresh drizzle instance per event', () => {
    const mockEvent = {
      context: {
        cloudflare: {
          env: { HYPERDRIVE: { connectionString: 'postgres://fake:fake@localhost:5432/test' } },
        },
      },
    } as any
    const db1 = useDb(mockEvent)
    const db2 = useDb(mockEvent)
    expect(db1).toBeDefined()
    expect(db2).toBeDefined()
    expect(db1).not.toBe(db2)  // different instances — no module-level cache
  })

  it('throws when Hyperdrive binding is missing', () => {
    const mockEvent = { context: { cloudflare: { env: {} } } } as any
    expect(() => useDb(mockEvent)).toThrow(/HYPERDRIVE/)
  })
})
```

- [ ] **Step 5: Run test — expect FAIL**

```bash
pnpm test tests/unit/db.test.ts
```

Expected: fails because `server/utils/db.ts` does not exist.

- [ ] **Step 6: Create `server/utils/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { H3Event } from 'h3'
import * as schema from '~/server/db/schema'

export function useDb(event: H3Event) {
  const hd = event.context.cloudflare?.env?.HYPERDRIVE
  if (!hd?.connectionString) {
    throw new Error('HYPERDRIVE binding missing from event.context.cloudflare.env')
  }
  const pool = new Pool({ connectionString: hd.connectionString, max: 1 })
  return drizzle(pool, { schema })
}

export type Db = ReturnType<typeof useDb>
```

- [ ] **Step 7: Run test — expect PASS**

```bash
pnpm test tests/unit/db.test.ts
```

Expected: both tests pass.

- [ ] **Step 8: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 9: Re-run to confirm**

```bash
pnpm test
```

Expected: 2 passed.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(db): per-request useDb helper with drizzle + pg"
```

---

### Task 6: First migration — better-auth tables + custom user columns

**Files:**
- Create: `server/db/schema/auth.ts`
- Modify: `server/db/schema/index.ts`
- Generated: `server/db/migrations/0000_*.sql`

- [ ] **Step 1: Install better-auth and Drizzle adapter**

```bash
pnpm add better-auth
```

- [ ] **Step 2: Define the auth schema in `server/db/schema/auth.ts`**

```ts
import { pgTable, text, boolean, timestamp, uuid, integer, pgEnum, inet, bytea } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const userRole = pgEnum('user_role', ['owner', 'delegate'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: userRole('role').notNull().default('delegate'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),           // hashed OTP
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passkeys = pgTable('passkeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),  // base64
  counter: integer('counter').notNull().default(0),
  deviceType: text('device_type'),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: text('transports'),           // comma-separated
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Short-TTL store for WebAuthn challenges (used in both login and step-up approval).
export const authChallenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeHash: text('challenge_hash').notNull(),   // sha256 of challenge bytes, hex
  payload: text('payload'),                           // canonical json of decision_payload (null for plain login)
  purpose: text('purpose').notNull(),                 // 'login' | 'device-approval'
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Re-export from index**

`server/db/schema/index.ts`:

```ts
export * from './auth'
```

- [ ] **Step 4: Generate the migration**

Ensure `.env` has `DATABASE_URL`, then:

```bash
pnpm drizzle-kit generate
```

Expected: file `server/db/migrations/0000_<random>.sql` created containing `CREATE TABLE users ...` etc.

- [ ] **Step 5: Apply the migration locally**

```bash
pnpm drizzle-kit migrate
```

Expected: tables exist in `comando_dev`. Verify with `psql`:

```bash
psql $DATABASE_URL -c '\dt'
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(db): auth schema + first migration"
```

---

## Milestone C — Auth core (Tasks 7–9)

### Task 7: better-auth integration with passkey + emailOTP plugins

**Files:**
- Create: `server/utils/auth.ts`
- Create: `server/api/auth/[...handler].ts`
- Create: `server/utils/errors.ts`
- Create: `tests/unit/errors.test.ts`

- [ ] **Step 1: Install plugins**

```bash
pnpm add @better-auth/passkey @better-auth/email-otp
```

- [ ] **Step 2: Write failing test for `createApiError`**

`tests/unit/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createApiError, ErrCode } from '~/server/utils/errors'

describe('createApiError', () => {
  it('builds a standard error envelope', () => {
    const err = createApiError(ErrCode.DEVICE_APPROVAL_REQUIRED, 'Aprovação necessária', { approvalId: 'abc' })
    expect(err.statusCode).toBe(403)
    expect(err.data).toEqual({
      error: {
        code: 'ERR_DEVICE_APPROVAL_REQUIRED',
        message: 'Aprovação necessária',
        details: { approvalId: 'abc' },
      },
    })
  })

  it('omits details when absent', () => {
    const err = createApiError(ErrCode.NO_ASSISTANT, 'Sem assistente')
    expect(err.data.error).not.toHaveProperty('details')
  })
})
```

- [ ] **Step 3: Create `server/utils/errors.ts`**

```ts
import { createError } from 'h3'

export const ErrCode = {
  DEVICE_APPROVAL_REQUIRED: 'ERR_DEVICE_APPROVAL_REQUIRED',
  NO_ASSISTANT: 'ERR_NO_ASSISTANT',
  REASSIGN_FORBIDDEN: 'ERR_REASSIGN_FORBIDDEN',
  INVITATION_EXPIRED: 'ERR_INVITATION_EXPIRED',
  APPROVAL_EXPIRED: 'ERR_APPROVAL_EXPIRED',
  SIGNATURE_INVALID: 'ERR_SIGNATURE_INVALID',
  RATE_LIMITED: 'ERR_RATE_LIMITED',
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  NOT_FOUND: 'ERR_NOT_FOUND',
  BAD_REQUEST: 'ERR_BAD_REQUEST',
  FORBIDDEN: 'ERR_FORBIDDEN',
} as const

export type ErrCodeT = typeof ErrCode[keyof typeof ErrCode]

const STATUS: Record<ErrCodeT, number> = {
  ERR_DEVICE_APPROVAL_REQUIRED: 403,
  ERR_NO_ASSISTANT: 409,
  ERR_REASSIGN_FORBIDDEN: 403,
  ERR_INVITATION_EXPIRED: 410,
  ERR_APPROVAL_EXPIRED: 410,
  ERR_SIGNATURE_INVALID: 400,
  ERR_RATE_LIMITED: 429,
  ERR_UNAUTHORIZED: 401,
  ERR_NOT_FOUND: 404,
  ERR_BAD_REQUEST: 400,
  ERR_FORBIDDEN: 403,
}

export function createApiError(code: ErrCodeT, message: string, details?: unknown) {
  const err: any = { error: { code, message } }
  if (details !== undefined) err.error.details = details
  return createError({
    statusCode: STATUS[code],
    data: err,
    message,
  })
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm test tests/unit/errors.test.ts
```

- [ ] **Step 5: Create `server/utils/auth.ts`** (factory — no module-level singleton)

```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { passkey } from 'better-auth/plugins/passkey'
import { emailOTP } from 'better-auth/plugins/email-otp'
import type { H3Event } from 'h3'
import { useDb } from './db'
import { useMailer } from './mailer'

export function useAuth(event: H3Event) {
  const db = useDb(event)
  const mailer = useMailer(event)
  const config = useRuntimeConfig(event)

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),
    secret: config.authSecret,
    baseURL: config.public.siteUrl,
    emailAndPassword: { enabled: false },
    plugins: [
      passkey({
        rpID: new URL(config.public.siteUrl).hostname,
        rpName: 'Comando',
        origin: config.public.siteUrl,
      }),
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await mailer.send({
            to: email,
            subject: 'Seu código de acesso',
            text: `Código: ${otp}\n\nExpira em 10 minutos.`,
          })
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof useAuth>
```

- [ ] **Step 6: Create handler mount**

`server/api/auth/[...handler].ts`:

```ts
import { useAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const auth = useAuth(event)
  return auth.handler(toWebRequest(event))
})
```

- [ ] **Step 7: Stub mailer** (real implementation in Task 21)

`server/utils/mailer.ts`:

```ts
import type { H3Event } from 'h3'

export function useMailer(event: H3Event) {
  const config = useRuntimeConfig(event)
  return {
    async send(args: { to: string; subject: string; text: string; html?: string }) {
      if (!config.resendApiKey) {
        console.warn('[mailer] stub:', args.to, args.subject, args.text)
        return { id: 'stub' }
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.resendFromEmail,
          to: args.to,
          subject: args.subject,
          text: args.text,
          html: args.html,
        }),
      })
      if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`)
      return res.json()
    },
  }
}
```

- [ ] **Step 8: Typecheck + commit**

```bash
pnpm typecheck
git add .
git commit -m "feat(auth): better-auth wired with passkey and emailOTP plugins"
```

---

### Task 8: Bootstrap guard on emailOTP — reject OTP login if user has passkey

**Files:**
- Create: `server/api/auth/email-otp/send.post.ts`
- Create: `server/api/auth/email-otp/verify.post.ts`
- Create: `tests/integration/email-otp-bootstrap-guard.test.ts`

The idea: wrap the better-auth OTP endpoints with our own custom logic that refuses to complete verification when the user already has a passkey — forcing the device-approval flow (Task 10+) instead. The request for OTP `send` is always allowed (OTP itself is also what approves a new device in the step-up flow).

- [ ] **Step 1: Write failing integration test**

`tests/integration/email-otp-bootstrap-guard.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { useTestDb, seedUser, addPasskey, seedVerification } from './helpers'

describe('POST /api/auth/email-otp/verify — bootstrap guard', () => {
  it('allows verify when user has no passkeys', async () => {
    const { db, request } = await useTestDb()
    await seedUser(db, { email: 'fresh@example.com' })
    await seedVerification(db, { identifier: 'fresh@example.com', code: '123456' })
    const res = await request('/api/auth/email-otp/verify', {
      method: 'POST',
      body: { email: 'fresh@example.com', otp: '123456' },
    })
    expect(res.status).toBe(200)
    expect(res.body.session).toBeDefined()
    expect(res.body.session.purpose).toBe('bootstrap')
  })

  it('rejects verify when user already has a passkey and creates a device_approval', async () => {
    const { db, request } = await useTestDb()
    const userId = await seedUser(db, { email: 'returning@example.com' })
    await addPasskey(db, { userId })
    await seedVerification(db, { identifier: 'returning@example.com', code: '654321' })
    const res = await request('/api/auth/email-otp/verify', {
      method: 'POST',
      body: { email: 'returning@example.com', otp: '654321' },
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ERR_DEVICE_APPROVAL_REQUIRED')
    expect(res.body.error.details.approvalId).toBeTypeOf('string')
  })
})
```

- [ ] **Step 2: Create test helpers (stubs for now; filled as each milestone arrives)**

`tests/integration/helpers.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import * as schema from '~/server/db/schema'

export async function useTestDb() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/comando_test'
  const pool = new Pool({ connectionString: url, max: 1 })
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder: './server/db/migrations' })
  // Truncate everything.
  await db.execute(`TRUNCATE TABLE users, sessions, passkeys, verifications, auth_challenges, device_approvals RESTART IDENTITY CASCADE`)
  return { db, request: makeRequest() }
}

function makeRequest() {
  return async (path: string, init: { method: string; body?: any; headers?: Record<string, string> }) => {
    const url = `http://localhost:3000${path}`
    const res = await fetch(url, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, body }
  }
}

export async function seedUser(db: any, args: { email: string; role?: 'owner' | 'delegate' }) {
  const [u] = await db.insert(schema.users).values({
    email: args.email, name: args.email.split('@')[0], role: args.role ?? 'delegate',
  }).returning()
  return u.id as string
}

export async function addPasskey(db: any, args: { userId: string }) {
  await db.insert(schema.passkeys).values({
    userId: args.userId,
    credentialId: `cred_${crypto.randomUUID()}`,
    publicKey: 'base64publickey',
  })
}

export async function seedVerification(db: any, args: { identifier: string; code: string }) {
  const { createHash } = await import('node:crypto')
  const hashed = createHash('sha256').update(args.code).digest('hex')
  await db.insert(schema.verifications).values({
    identifier: args.identifier,
    value: hashed,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  })
}
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
pnpm test tests/integration/email-otp-bootstrap-guard.test.ts
```

Expected: fails because the endpoints don't exist yet.

- [ ] **Step 4: Create `server/api/auth/email-otp/send.post.ts`**

```ts
import { z } from 'zod'
import { useAuth } from '~/server/utils/auth'
import { checkRateLimit } from '~/server/utils/rateLimit'

const schema = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const body = schema.parse(await readBody(event))
  await checkRateLimit(event, { key: `otp-send:${body.email}`, limit: 5, windowSec: 3600 })
  const auth = useAuth(event)
  // Delegate to better-auth's email-otp plugin to send the code.
  return auth.api.sendVerificationEmail({ body: { email: body.email, type: 'sign-in' } })
})
```

- [ ] **Step 5: Create `server/api/auth/email-otp/verify.post.ts`**

```ts
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { useAuth } from '~/server/utils/auth'
import { users, passkeys, deviceApprovals } from '~/server/db/schema'
import { createApiError, ErrCode } from '~/server/utils/errors'
import { readFingerprint, ensureFingerprint } from '~/server/utils/deviceFingerprint'
import { checkRateLimit } from '~/server/utils/rateLimit'

const schema = z.object({ email: z.string().email(), otp: z.string().length(6) })

export default defineEventHandler(async (event) => {
  const body = schema.parse(await readBody(event))
  await checkRateLimit(event, { key: `otp-verify:${body.email}`, limit: 10, windowSec: 3600 })
  const db = useDb(event)
  const auth = useAuth(event)

  const [user] = await db.select().from(users).where(eq(users.email, body.email))
  if (!user) throw createApiError(ErrCode.NOT_FOUND, 'Conta não encontrada.')

  // Verify the OTP via better-auth (throws on invalid).
  const otpResult = await auth.api.verifyEmailOTP({ body: { email: body.email, otp: body.otp } })
  if (!otpResult?.success) throw createApiError(ErrCode.BAD_REQUEST, 'Código inválido.')

  // Bootstrap guard: if user has any passkey, deny OTP login and open a device_approval.
  const [hasPasskey] = await db.select({ id: passkeys.id }).from(passkeys)
    .where(eq(passkeys.userId, user.id)).limit(1)

  if (hasPasskey) {
    const fp = await ensureFingerprint(event)
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? null
    const ua = getRequestHeader(event, 'user-agent') ?? ''
    const [approval] = await db.insert(deviceApprovals).values({
      userId: user.id,
      requestFingerprint: fp,
      requestUserAgent: ua,
      requestIp: ip as any,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }).returning()

    // Notify user via email that a new-device request is pending.
    const { useMailer } = await import('~/server/utils/mailer')
    await useMailer(event).send({
      to: user.email,
      subject: 'Novo dispositivo pediu acesso ao Comando',
      text: `Um dispositivo (${ua}, IP ${ip}) pediu acesso à sua conta. Aprove no seu dispositivo de confiança em até 15 minutos.`,
    })

    throw createApiError(ErrCode.DEVICE_APPROVAL_REQUIRED, 'Dispositivo precisa de aprovação.', {
      approvalId: approval.id,
    })
  }

  // Bootstrap path: create a short-lived onboarding session (handled by better-auth).
  const session = await auth.api.createSession({ body: { userId: user.id, purpose: 'bootstrap' } })
  return { session }
})
```

- [ ] **Step 6: Run test — expect PASS** (after stubs for `rateLimit`, `deviceFingerprint`, `deviceApprovals` schema arrive in Tasks 9–10; this task's tests are run after Task 10)

Note: this test depends on the device_approvals table (Task 10) and device fingerprint helper (Task 9). Mark this task's test as pending and re-run once those arrive. For now, just confirm `pnpm typecheck` passes.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(auth): email-otp endpoints with bootstrap guard stub"
```

---

### Task 9: Device fingerprint cookie helper + login/onboarding pages skeleton

**Files:**
- Create: `server/utils/deviceFingerprint.ts`
- Create: `app/pages/login.vue`
- Create: `app/pages/onboarding/passkey.vue`
- Create: `app/composables/useAuth.ts`
- Create: `tests/unit/deviceFingerprint.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/deviceFingerprint.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFingerprint, ensureFingerprint } from '~/server/utils/deviceFingerprint'

function makeEvent() {
  const cookies: Record<string, string> = {}
  return {
    node: {
      req: { headers: { cookie: '' } },
      res: { getHeader: () => [], setHeader: (_: string, v: string) => { const m = v.match(/device_fingerprint=([^;]+)/); if (m) cookies.device_fingerprint = m[1] } },
    },
    context: {},
    get _cookies() { return cookies },
  } as any
}

describe('deviceFingerprint', () => {
  it('ensureFingerprint creates a cookie when absent', async () => {
    const event = makeEvent()
    const fp = await ensureFingerprint(event)
    expect(fp).toMatch(/^[0-9a-f-]{36}$/)
    expect(event._cookies.device_fingerprint).toBe(fp)
  })

  it('readFingerprint returns null when cookie absent', () => {
    const event = makeEvent()
    expect(readFingerprint(event)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test tests/unit/deviceFingerprint.test.ts
```

- [ ] **Step 3: Create `server/utils/deviceFingerprint.ts`**

```ts
import type { H3Event } from 'h3'

const COOKIE_NAME = 'device_fingerprint'
const ONE_YEAR = 60 * 60 * 24 * 365

export function readFingerprint(event: H3Event): string | null {
  return getCookie(event, COOKIE_NAME) ?? null
}

export async function ensureFingerprint(event: H3Event): Promise<string> {
  const existing = readFingerprint(event)
  if (existing) return existing
  const fp = crypto.randomUUID()
  setCookie(event, COOKIE_NAME, fp, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ONE_YEAR,
    path: '/',
  })
  return fp
}

export function clearFingerprint(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Create `app/composables/useAuth.ts`**

```ts
export function useAuth() {
  const user = useState<any | null>('auth:user', () => null)

  async function sendOtp(email: string) {
    return $fetch('/api/auth/email-otp/send', { method: 'POST', body: { email } })
  }

  async function verifyOtp(email: string, otp: string) {
    try {
      const res = await $fetch('/api/auth/email-otp/verify', {
        method: 'POST', body: { email, otp },
      })
      return { status: 'ok' as const, session: (res as any).session }
    } catch (e: any) {
      const code = e?.data?.error?.code
      if (code === 'ERR_DEVICE_APPROVAL_REQUIRED') {
        return { status: 'approval-required' as const, approvalId: e.data.error.details.approvalId }
      }
      throw e
    }
  }

  async function registerPasskey() {
    const opts = await $fetch('/api/auth/passkey/register/options', { method: 'POST' })
    const cred = await navigator.credentials.create({ publicKey: opts as any })
    return $fetch('/api/auth/passkey/register/verify', { method: 'POST', body: cred })
  }

  async function signInWithPasskey() {
    const opts = await $fetch('/api/auth/passkey/authenticate/options', { method: 'POST' })
    const assertion = await navigator.credentials.get({ publicKey: opts as any })
    return $fetch('/api/auth/passkey/authenticate/verify', { method: 'POST', body: assertion })
  }

  async function logout() {
    await $fetch('/api/auth/sign-out', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  return { user, sendOtp, verifyOtp, registerPasskey, signInWithPasskey, logout }
}
```

- [ ] **Step 6: Create `app/pages/login.vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const auth = useAuth()
const step = ref<'email' | 'otp' | 'waiting'>('email')
const email = ref('')
const otp = ref('')
const approvalId = ref<string | null>(null)
const err = ref('')

async function onSendOtp() {
  err.value = ''
  try {
    await auth.sendOtp(email.value)
    step.value = 'otp'
  } catch (e: any) { err.value = e?.data?.error?.message ?? 'Falha ao enviar código.' }
}

async function onVerifyOtp() {
  err.value = ''
  try {
    const res = await auth.verifyOtp(email.value, otp.value)
    if (res.status === 'approval-required') {
      approvalId.value = res.approvalId!
      await navigateTo(`/login/waiting?approval=${res.approvalId}`)
    } else {
      await navigateTo('/onboarding/passkey')
    }
  } catch (e: any) { err.value = e?.data?.error?.message ?? 'Código inválido.' }
}

async function onPasskey() {
  err.value = ''
  try {
    await auth.signInWithPasskey()
    await navigateTo('/trabalho')
  } catch { err.value = 'Não foi possível autenticar com passkey.' }
}
</script>

<template>
  <UContainer class="max-w-md py-12">
    <h1 class="text-2xl font-semibold mb-6">Entrar no Comando</h1>
    <div v-if="step === 'email'" class="space-y-4">
      <UButton block @click="onPasskey">Entrar com passkey</UButton>
      <div class="text-center text-sm text-gray-500">ou</div>
      <UInput v-model="email" type="email" placeholder="seu@email.com" />
      <UButton block :disabled="!email" @click="onSendOtp">Enviar código por email</UButton>
    </div>
    <div v-else-if="step === 'otp'" class="space-y-4">
      <p class="text-sm text-gray-600">Código enviado para {{ email }}.</p>
      <UInput v-model="otp" placeholder="6 dígitos" maxlength="6" />
      <UButton block :disabled="otp.length !== 6" @click="onVerifyOtp">Confirmar</UButton>
      <UButton variant="ghost" block @click="step = 'email'">Voltar</UButton>
    </div>
    <p v-if="err" class="text-red-600 text-sm mt-4">{{ err }}</p>
  </UContainer>
</template>
```

- [ ] **Step 7: Create `app/pages/onboarding/passkey.vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const auth = useAuth()
const err = ref('')
const busy = ref(false)

async function onRegister() {
  busy.value = true; err.value = ''
  try {
    await auth.registerPasskey()
    await navigateTo('/trabalho')
  } catch (e: any) {
    err.value = 'Não foi possível cadastrar a passkey. Tente novamente.'
  } finally { busy.value = false }
}
</script>

<template>
  <UContainer class="max-w-md py-12 text-center space-y-6">
    <h1 class="text-2xl font-semibold">Cadastrar passkey deste dispositivo</h1>
    <p class="text-gray-600">A passkey substitui a senha. Use Face ID, Touch ID ou PIN.</p>
    <UButton :loading="busy" size="lg" @click="onRegister">Cadastrar passkey</UButton>
    <p v-if="err" class="text-red-600 text-sm">{{ err }}</p>
  </UContainer>
</template>
```

- [ ] **Step 8: Create `app/layouts/auth.vue`**

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-[var(--bg)]">
    <slot />
  </div>
</template>
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat(auth): device fingerprint + login + onboarding passkey pages"
```

---

## Milestone D — Trust-device with signed approvals (Tasks 10–14)

### Task 10: `device_approvals` table + `rateLimit` + `challenges` stores

**Files:**
- Create: `server/db/schema/deviceApproval.ts`
- Modify: `server/db/schema/index.ts`
- Create: `server/utils/rateLimit.ts`
- Create: `server/utils/challenges.ts`
- Generated: `server/db/migrations/0001_*.sql`

- [ ] **Step 1: Create `server/db/schema/deviceApproval.ts`**

```ts
import { pgTable, uuid, text, timestamp, pgEnum, inet, jsonb, bytea } from 'drizzle-orm/pg-core'
import { users, sessions, passkeys } from './auth'

export const deviceApprovalStatus = pgEnum('device_approval_status', [
  'pending', 'approved', 'rejected', 'expired',
])

export const deviceApprovals = pgTable('device_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestFingerprint: text('request_fingerprint').notNull(),
  requestUserAgent: text('request_user_agent'),
  requestIp: inet('request_ip'),
  status: deviceApprovalStatus('status').notNull().default('pending'),
  decidedBySessionId: uuid('decided_by_session_id').references(() => sessions.id, { onDelete: 'set null' }),
  decidedWithPasskeyId: uuid('decided_with_passkey_id').references(() => passkeys.id, { onDelete: 'set null' }),
  decisionPayload: jsonb('decision_payload'),
  decisionSignature: bytea('decision_signature'),
  decisionClientData: bytea('decision_client_data'),
  decisionAuthenticatorData: bytea('decision_authenticator_data'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

// Separate table for rate-limiting counters (keyed by action+subject).
export const rateLimitCounters = pgTable('rate_limit_counters', {
  key: text('key').primaryKey(),
  count: text('count').notNull().default('0'),  // stored as text to allow atomic bigint bump if we migrate
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Add export to `server/db/schema/index.ts`**

```ts
export * from './auth'
export * from './deviceApproval'
```

- [ ] **Step 3: Generate migration**

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

- [ ] **Step 4: Write failing test for `checkRateLimit`**

`tests/integration/rateLimit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit } from '~/server/utils/rateLimit'
import { useTestDb } from './helpers'

describe('checkRateLimit', () => {
  it('allows up to `limit` calls in the window then throws', async () => {
    const { db } = await useTestDb()
    const fakeEvent = { context: { _db: db } } as any
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(fakeEvent, { key: 'test:x', limit: 3, windowSec: 60 })
    }
    await expect(checkRateLimit(fakeEvent, { key: 'test:x', limit: 3, windowSec: 60 }))
      .rejects.toThrow(/ERR_RATE_LIMITED/)
  })
})
```

- [ ] **Step 5: Implement `server/utils/rateLimit.ts`**

```ts
import { sql } from 'drizzle-orm'
import { rateLimitCounters } from '~/server/db/schema'
import { useDb } from './db'
import { createApiError, ErrCode } from './errors'
import type { H3Event } from 'h3'

export async function checkRateLimit(
  event: H3Event,
  args: { key: string; limit: number; windowSec: number },
) {
  const db = (event.context as any)._db ?? useDb(event)
  const now = new Date()
  // Upsert with window reset logic.
  const result = await db.execute(sql`
    INSERT INTO rate_limit_counters (key, count, window_start)
    VALUES (${args.key}, '1', ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_counters.window_start < ${new Date(now.getTime() - args.windowSec * 1000)}
        THEN '1'
        ELSE (rate_limit_counters.count::bigint + 1)::text
      END,
      window_start = CASE
        WHEN rate_limit_counters.window_start < ${new Date(now.getTime() - args.windowSec * 1000)}
        THEN ${now}
        ELSE rate_limit_counters.window_start
      END
    RETURNING count::bigint AS count
  `)
  const count = Number((result.rows?.[0] as any)?.count ?? 0)
  if (count > args.limit) {
    throw createApiError(ErrCode.RATE_LIMITED, 'Muitas tentativas. Tente mais tarde.')
  }
}
```

- [ ] **Step 6: Run test — expect PASS**

- [ ] **Step 7: Implement `server/utils/challenges.ts`**

```ts
import { and, eq, isNull, lt } from 'drizzle-orm'
import { authChallenges } from '~/server/db/schema'
import { useDb } from './db'
import type { H3Event } from 'h3'
import { createHash, randomBytes } from 'node:crypto'

export function sha256Hex(buf: Buffer | string) {
  return createHash('sha256').update(buf).digest('hex')
}

export async function storeChallenge(event: H3Event, args: {
  challenge: string        // base64url of raw bytes
  payload?: unknown        // canonical json for device approvals
  purpose: 'login' | 'device-approval'
  userId?: string | null
  ttlSec?: number
}) {
  const db = useDb(event)
  const ttl = args.ttlSec ?? 120
  await db.insert(authChallenges).values({
    challengeHash: sha256Hex(args.challenge),
    payload: args.payload ? JSON.stringify(args.payload) : null,
    purpose: args.purpose,
    userId: args.userId ?? null,
    expiresAt: new Date(Date.now() + ttl * 1000),
  })
}

export async function consumeChallenge(event: H3Event, args: {
  challenge: string
  purpose: 'login' | 'device-approval'
}): Promise<{ payload: any } | null> {
  const db = useDb(event)
  const hash = sha256Hex(args.challenge)
  const now = new Date()
  const rows = await db.select().from(authChallenges)
    .where(and(
      eq(authChallenges.challengeHash, hash),
      eq(authChallenges.purpose, args.purpose),
      isNull(authChallenges.consumedAt),
    ))
  const row = rows.find(r => r.expiresAt > now)
  if (!row) return null
  await db.execute(sql`UPDATE auth_challenges SET consumed_at = ${now} WHERE id = ${row.id}`)
  return { payload: row.payload ? JSON.parse(row.payload) : null }
}

export function randomChallenge(): string {
  return randomBytes(32).toString('base64url')
}
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(auth): device_approvals schema + rate limiter + challenge store"
```

---

### Task 11: Challenge endpoint + canonical payload + signature verify helper

**Files:**
- Create: `server/utils/signatureAudit.ts`
- Create: `server/api/auth/device-approvals/[id]/challenge.get.ts`
- Create: `tests/unit/signatureAudit.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/signatureAudit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { canonicalJson, buildDecisionPayload, verifyApprovalAssertion } from '~/server/utils/signatureAudit'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'

describe('canonicalJson', () => {
  it('sorts keys deterministically at every depth', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } })
    const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}')
  })
})

describe('buildDecisionPayload', () => {
  it('captures approval metadata + generates challenge hash', () => {
    const approval = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      requestFingerprint: 'fp-1', requestUserAgent: 'ua', requestIp: '1.2.3.4',
    } as any
    const { payload, challenge } = buildDecisionPayload(approval, 'approve')
    expect(payload.approval_id).toBe(approval.id)
    expect(payload.decision).toBe('approve')
    expect(payload.target_user_id).toBe(approval.userId)
    expect(payload.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // challenge = sha256(canonical_json(payload))
    const expected = createHash('sha256').update(canonicalJson(payload)).digest('base64url')
    expect(challenge).toBe(expected)
  })
})

describe('verifyApprovalAssertion', () => {
  it('accepts a valid signature over the challenge', async () => {
    // Generate a throwaway EC keypair to simulate a passkey.
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' })

    const approval = { id: 'a', userId: 'u', requestFingerprint: 'fp', requestUserAgent: 'ua', requestIp: '1.1.1.1' } as any
    const { payload, challenge } = buildDecisionPayload(approval, 'approve')

    // Build WebAuthn-like clientDataJSON.
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin: 'https://example.com',
    }))
    const authenticatorData = Buffer.alloc(37)  // dummy — verify fn uses rpIdHash check off for tests
    const toSign = Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()])
    const signature = sign('SHA256', toSign, privateKey)

    const ok = await verifyApprovalAssertion({
      decisionPayload: payload, expectedChallenge: challenge,
      assertion: {
        signature: signature.toString('base64'),
        clientDataJSON: clientDataJSON.toString('base64'),
        authenticatorData: authenticatorData.toString('base64'),
      },
      publicKeySpkiBase64: spkiDer.toString('base64'),
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: false,
    })
    expect(ok).toBe(true)
  })

  it('rejects tampered payload', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' })
    const approval = { id: 'a', userId: 'u', requestFingerprint: 'fp', requestUserAgent: 'ua', requestIp: '1.1.1.1' } as any
    const { payload, challenge } = buildDecisionPayload(approval, 'approve')

    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin: 'https://example.com',
    }))
    const authenticatorData = Buffer.alloc(37)
    const toSign = Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()])
    const signature = sign('SHA256', toSign, privateKey)

    // Mutate payload to simulate tampering.
    const tampered = { ...payload, decision: 'reject' as const }
    const ok = await verifyApprovalAssertion({
      decisionPayload: tampered, expectedChallenge: challenge,
      assertion: {
        signature: signature.toString('base64'),
        clientDataJSON: clientDataJSON.toString('base64'),
        authenticatorData: authenticatorData.toString('base64'),
      },
      publicKeySpkiBase64: spkiDer.toString('base64'),
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: false,
    })
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `server/utils/signatureAudit.ts`**

```ts
import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto'

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

export type DecisionPayload = {
  approval_id: string
  decision: 'approve' | 'reject'
  target_user_id: string
  requester_fingerprint: string
  requester_ua: string
  requester_ip: string | null
  decided_at: string
  nonce: string
}

export function buildDecisionPayload(
  approval: {
    id: string; userId: string;
    requestFingerprint: string; requestUserAgent: string | null; requestIp: string | null
  },
  decision: 'approve' | 'reject',
): { payload: DecisionPayload; challenge: string } {
  const payload: DecisionPayload = {
    approval_id: approval.id,
    decision,
    target_user_id: approval.userId,
    requester_fingerprint: approval.requestFingerprint,
    requester_ua: approval.requestUserAgent ?? '',
    requester_ip: approval.requestIp,
    decided_at: new Date().toISOString(),
    nonce: randomBytes(32).toString('base64url'),
  }
  const challenge = createHash('sha256').update(canonicalJson(payload)).digest('base64url')
  return { payload, challenge }
}

export type AssertionInput = {
  signature: string            // base64
  clientDataJSON: string       // base64 of raw bytes
  authenticatorData: string    // base64
}

export async function verifyApprovalAssertion(args: {
  decisionPayload: DecisionPayload
  expectedChallenge: string
  assertion: AssertionInput
  publicKeySpkiBase64: string    // passkey.public_key stored as SPKI base64
  expectedOrigin: string
  verifyRpIdHash?: boolean       // true in prod; disable-able for tests that use dummy authData
  expectedRpIdHash?: Buffer
}): Promise<boolean> {
  // 1. Recompute challenge from payload.
  const recomputed = createHash('sha256').update(canonicalJson(args.decisionPayload)).digest('base64url')
  if (recomputed !== args.expectedChallenge) return false

  // 2. Parse clientDataJSON.
  const clientDataRaw = Buffer.from(args.assertion.clientDataJSON, 'base64')
  let clientData: any
  try { clientData = JSON.parse(clientDataRaw.toString('utf-8')) } catch { return false }
  if (clientData.type !== 'webauthn.get') return false
  if (clientData.origin !== args.expectedOrigin) return false
  if (clientData.challenge !== args.expectedChallenge) return false

  // 3. (Optional) rpIdHash check against authenticatorData[0..32].
  const authData = Buffer.from(args.assertion.authenticatorData, 'base64')
  if (args.verifyRpIdHash !== false) {
    if (!args.expectedRpIdHash) return false
    if (!authData.slice(0, 32).equals(args.expectedRpIdHash)) return false
  }

  // 4. Verify signature over authData || sha256(clientDataJSON).
  const hashedClient = createHash('sha256').update(clientDataRaw).digest()
  const signed = Buffer.concat([authData, hashedClient])

  try {
    const pubKey = createPublicKey({
      key: Buffer.from(args.publicKeySpkiBase64, 'base64'),
      format: 'der', type: 'spki',
    })
    const verifier = createVerify('SHA256')
    verifier.update(signed)
    return verifier.verify(pubKey, Buffer.from(args.assertion.signature, 'base64'))
  } catch { return false }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test tests/unit/signatureAudit.test.ts
```

- [ ] **Step 5: Create challenge endpoint**

`server/api/auth/device-approvals/[id]/challenge.get.ts`:

```ts
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { deviceApprovals, passkeys } from '~/server/db/schema'
import { buildDecisionPayload } from '~/server/utils/signatureAudit'
import { storeChallenge } from '~/server/utils/challenges'
import { createApiError, ErrCode } from '~/server/utils/errors'
import { getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const approvalId = getRouterParam(event, 'id')!
  const decision = (getQuery(event).decision ?? 'approve') as 'approve' | 'reject'
  if (decision !== 'approve' && decision !== 'reject') {
    throw createApiError(ErrCode.BAD_REQUEST, 'Decisão inválida.')
  }

  const db = useDb(event)
  const [approval] = await db.select().from(deviceApprovals)
    .where(eq(deviceApprovals.id, approvalId))
  if (!approval) throw createApiError(ErrCode.NOT_FOUND, 'Aprovação não encontrada.')
  if (approval.userId !== user.id) throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')
  if (approval.status !== 'pending') throw createApiError(ErrCode.BAD_REQUEST, 'Aprovação já decidida.')
  if (approval.expiresAt < new Date()) throw createApiError(ErrCode.APPROVAL_EXPIRED, 'Aprovação expirada.')

  const userPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, user.id))
  const allowCredentials = userPasskeys.map(p => ({
    id: p.credentialId,
    type: 'public-key' as const,
    transports: p.transports ? p.transports.split(',') : undefined,
  }))

  const { payload, challenge } = buildDecisionPayload(approval, decision)
  await storeChallenge(event, {
    challenge, payload, purpose: 'device-approval', userId: user.id, ttlSec: 120,
  })

  return {
    challenge,
    allowCredentials,
    decisionPayload: payload,
    userVerification: 'required' as const,
  }
})
```

- [ ] **Step 6: Add `requireAuthedUser` helper to `server/utils/auth.ts`**

Append to `server/utils/auth.ts`:

```ts
import { createApiError, ErrCode } from './errors'
import { sessions, users } from '~/server/db/schema'
import { and, eq, gt } from 'drizzle-orm'

export async function requireAuthedUser(event: H3Event) {
  const token = getCookie(event, 'comando.session') ?? getRequestHeader(event, 'authorization')?.replace(/^Bearer /, '')
  if (!token) throw createApiError(ErrCode.UNAUTHORIZED, 'Sem sessão.')
  const db = useDb(event)
  const rows = await db.select({ session: sessions, user: users })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
  if (rows.length === 0) throw createApiError(ErrCode.UNAUTHORIZED, 'Sessão inválida ou expirada.')
  return rows[0]
}
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(auth): challenge endpoint + signature audit helper with tests"
```

---

### Task 12: Device approval `decide` endpoint (step-up verification)

**Files:**
- Create: `server/api/auth/device-approvals/[id]/decide.post.ts`
- Create: `tests/integration/device-approval-decide.test.ts`

- [ ] **Step 1: Write failing integration test**

`tests/integration/device-approval-decide.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useTestDb, seedUser, seedSession, seedPasskeyFromKeypair, signApproval } from './helpers'
import { generateKeyPairSync } from 'node:crypto'

describe('POST /api/auth/device-approvals/:id/decide', () => {
  it('approves when assertion is valid, grants onboarding session to requester', async () => {
    const { db, request, context } = await useTestDb()
    const userId = await seedUser(db, { email: 'u@x' })
    const { sessionToken } = await seedSession(db, { userId })
    const kp = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const passkeyId = await seedPasskeyFromKeypair(db, { userId, keypair: kp })

    const [approval] = await db.insert(context.schema.deviceApprovals).values({
      userId, requestFingerprint: 'fp-new', requestUserAgent: 'new-ua',
      requestIp: '2.2.2.2' as any, expiresAt: new Date(Date.now() + 15 * 60_000),
    }).returning()

    const challengeRes = await request(`/api/auth/device-approvals/${approval.id}/challenge?decision=approve`, {
      method: 'GET', headers: { Cookie: `comando.session=${sessionToken}` },
    })
    expect(challengeRes.status).toBe(200)
    const { decisionPayload, challenge } = challengeRes.body

    const assertion = signApproval({ keypair: kp, challenge, origin: 'http://localhost:3000' })

    const decideRes = await request(`/api/auth/device-approvals/${approval.id}/decide`, {
      method: 'POST',
      headers: { Cookie: `comando.session=${sessionToken}` },
      body: { decisionPayload, assertion },
    })
    expect(decideRes.status).toBe(200)
    expect(decideRes.body.status).toBe('approved')
    expect(decideRes.body.onboardingSessionToken).toBeTypeOf('string')

    const [row] = await db.select().from(context.schema.deviceApprovals)
      .where(context.eq(context.schema.deviceApprovals.id, approval.id))
    expect(row.status).toBe('approved')
    expect(row.decisionSignature).toBeInstanceOf(Buffer)
    expect(row.decidedWithPasskeyId).toBe(passkeyId)
  })

  it('rejects tampered payload with ERR_SIGNATURE_INVALID', async () => {
    // ... similar setup; mutate decisionPayload.decision before POST; expect 400 with ERR_SIGNATURE_INVALID
  })
})
```

The helpers `seedSession`, `seedPasskeyFromKeypair`, `signApproval` need to be appended to `tests/integration/helpers.ts`. Add them:

```ts
import { createHash, sign, KeyPairKeyObjectResult } from 'node:crypto'
import { canonicalJson } from '~/server/utils/signatureAudit'

export async function seedSession(db: any, args: { userId: string }) {
  const token = 'sess_' + crypto.randomUUID()
  const [s] = await db.insert(/* sessions */).values({
    userId: args.userId, token, expiresAt: new Date(Date.now() + 86400000),
  }).returning()
  return { sessionId: s.id, sessionToken: token }
}

export async function seedPasskeyFromKeypair(db: any, args: { userId: string; keypair: KeyPairKeyObjectResult }) {
  const spki = args.keypair.publicKey.export({ format: 'der', type: 'spki' })
  const [p] = await db.insert(/* passkeys */).values({
    userId: args.userId,
    credentialId: 'cred_' + crypto.randomUUID(),
    publicKey: spki.toString('base64'),
  }).returning()
  return p.id
}

export function signApproval(args: { keypair: KeyPairKeyObjectResult; challenge: string; origin: string }) {
  const clientDataJSON = Buffer.from(JSON.stringify({
    type: 'webauthn.get', challenge: args.challenge, origin: args.origin,
  }))
  const authenticatorData = Buffer.alloc(37)
  const toSign = Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()])
  const signature = sign('SHA256', toSign, args.keypair.privateKey)
  return {
    signature: signature.toString('base64'),
    clientDataJSON: clientDataJSON.toString('base64'),
    authenticatorData: authenticatorData.toString('base64'),
  }
}
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `server/api/auth/device-approvals/[id]/decide.post.ts`**

```ts
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { deviceApprovals, passkeys, sessions } from '~/server/db/schema'
import { verifyApprovalAssertion } from '~/server/utils/signatureAudit'
import { consumeChallenge, sha256Hex } from '~/server/utils/challenges'
import { createApiError, ErrCode } from '~/server/utils/errors'
import { writeAudit } from '~/server/utils/audit'

const bodySchema = z.object({
  decisionPayload: z.object({
    approval_id: z.string(), decision: z.enum(['approve', 'reject']),
    target_user_id: z.string(), requester_fingerprint: z.string(),
    requester_ua: z.string(), requester_ip: z.string().nullable(),
    decided_at: z.string(), nonce: z.string(),
  }),
  assertion: z.object({
    signature: z.string(), clientDataJSON: z.string(), authenticatorData: z.string(),
  }),
})

export default defineEventHandler(async (event) => {
  const { user, session } = await requireAuthedUser(event)
  const approvalId = getRouterParam(event, 'id')!
  const body = bodySchema.parse(await readBody(event))

  if (body.decisionPayload.approval_id !== approvalId)
    throw createApiError(ErrCode.BAD_REQUEST, 'Payload não bate com approval.')
  if (body.decisionPayload.target_user_id !== user.id)
    throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')

  const db = useDb(event)
  const [approval] = await db.select().from(deviceApprovals)
    .where(eq(deviceApprovals.id, approvalId))
  if (!approval) throw createApiError(ErrCode.NOT_FOUND, 'Aprovação não encontrada.')
  if (approval.status !== 'pending')
    throw createApiError(ErrCode.BAD_REQUEST, 'Já decidida.')
  if (approval.expiresAt < new Date())
    throw createApiError(ErrCode.APPROVAL_EXPIRED, 'Expirada.')

  // Re-derive challenge from signed payload and consume it one-shot.
  const { createHash } = await import('node:crypto')
  const { canonicalJson } = await import('~/server/utils/signatureAudit')
  const challenge = createHash('sha256').update(canonicalJson(body.decisionPayload)).digest('base64url')
  const consumed = await consumeChallenge(event, { challenge, purpose: 'device-approval' })
  if (!consumed) throw createApiError(ErrCode.SIGNATURE_INVALID, 'Challenge inválido ou expirado.')

  // Find the passkey referenced by the credentialId returned by the browser.
  const { credentialId } = (body as any).credentialId
    ? { credentialId: (body as any).credentialId }
    : parseCredentialIdFromAssertion(body.assertion)
  const [pk] = credentialId
    ? await db.select().from(passkeys).where(eq(passkeys.credentialId, credentialId))
    : await db.select().from(passkeys).where(eq(passkeys.userId, user.id))
  if (!pk || pk.userId !== user.id)
    throw createApiError(ErrCode.SIGNATURE_INVALID, 'Passkey desconhecida.')

  const config = useRuntimeConfig(event)
  const origin = config.public.siteUrl
  const rpIdHash = createHash('sha256').update(new URL(origin).hostname).digest()

  const ok = await verifyApprovalAssertion({
    decisionPayload: body.decisionPayload,
    expectedChallenge: challenge,
    assertion: body.assertion,
    publicKeySpkiBase64: pk.publicKey,
    expectedOrigin: origin,
    verifyRpIdHash: true,
    expectedRpIdHash: rpIdHash,
  })
  if (!ok) throw createApiError(ErrCode.SIGNATURE_INVALID, 'Assinatura inválida.')

  const decided = await db.transaction(async (tx) => {
    const [updated] = await tx.update(deviceApprovals).set({
      status: body.decisionPayload.decision === 'approve' ? 'approved' : 'rejected',
      decidedAt: new Date(),
      decidedBySessionId: session.id,
      decidedWithPasskeyId: pk.id,
      decisionPayload: body.decisionPayload,
      decisionSignature: Buffer.from(body.assertion.signature, 'base64'),
      decisionClientData: Buffer.from(body.assertion.clientDataJSON, 'base64'),
      decisionAuthenticatorData: Buffer.from(body.assertion.authenticatorData, 'base64'),
    }).where(eq(deviceApprovals.id, approvalId)).returning()

    await writeAudit(tx, {
      entity: 'device_approval', entityId: approvalId,
      action: body.decisionPayload.decision === 'approve' ? 'approve' : 'reject',
      actorUserId: user.id,
      changes: { status: { from: 'pending', to: updated.status } },
      context: {
        signed_payload: body.decisionPayload,
        signature: body.assertion.signature,
        client_data: body.assertion.clientDataJSON,
        authenticator_data: body.assertion.authenticatorData,
        passkey_id: pk.id,
        passkey_credential_id: pk.credentialId,
      },
    })

    if (body.decisionPayload.decision === 'approve') {
      const onboardingToken = 'onb_' + crypto.randomUUID()
      await tx.insert(sessions).values({
        userId: user.id,
        token: onboardingToken,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        ipAddress: approval.requestIp as any,
        userAgent: approval.requestUserAgent,
      })
      return { status: 'approved' as const, onboardingSessionToken: onboardingToken }
    }
    return { status: 'rejected' as const }
  })

  return decided
})

function parseCredentialIdFromAssertion(_assertion: any): { credentialId?: string } {
  // In a real browser assertion the credentialId is part of PublicKeyCredential.id.
  // If the UI forwards it in `body.credentialId`, use it above. Otherwise fall back to
  // checking all user's passkeys (OK when user has 1 passkey, which is the norm per-device).
  return {}
}
```

- [ ] **Step 4: Add poll/status endpoint**

`server/api/auth/device-approvals/[id].get.ts`:

```ts
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { deviceApprovals } from '~/server/db/schema'
import { readFingerprint } from '~/server/utils/deviceFingerprint'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const approvalId = getRouterParam(event, 'id')!
  const db = useDb(event)
  const [approval] = await db.select().from(deviceApprovals)
    .where(eq(deviceApprovals.id, approvalId))
  if (!approval) throw createApiError(ErrCode.NOT_FOUND, 'Não encontrada.')
  // Only the requesting device can poll — match by fingerprint cookie.
  const fp = readFingerprint(event)
  if (fp !== approval.requestFingerprint) throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')

  // If approved, surface the onboarding session token so the UI can set it.
  if (approval.status === 'approved') {
    return {
      status: 'approved',
      onboardingSessionToken: event.context._onboardingTokenFor?.(approval.id) ?? null,
    }
  }
  return { status: approval.status }
})
```

Note: for MVP simplicity, the `decide` endpoint returns the onboarding token directly to the approver device. A cleaner version would store it linked to the approval (column `onboarding_session_id`) and let the requester's polling pick it up. **Do this cleaner version**: add `onboardingSessionId` FK column to `device_approvals` in Task 10, set it in `decide`, read it here.

**Retroactive fix for Task 10:** add `onboarding_session_id uuid references sessions(id)` column. Add a second migration.

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(auth): device approval decide endpoint with signature verification + non-repudiation audit"
```

---

### Task 13: Waiting page + `useDeviceApprovals` polling composable

**Files:**
- Create: `app/pages/login/waiting.vue`
- Create: `app/composables/useDeviceApprovals.ts`
- Create: `server/api/auth/device-approvals/index.get.ts` (list pending for user)

- [ ] **Step 1: Create list endpoint**

`server/api/auth/device-approvals/index.get.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { deviceApprovals } from '~/server/db/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const rows = await db.select().from(deviceApprovals)
    .where(and(eq(deviceApprovals.userId, user.id), eq(deviceApprovals.status, 'pending')))
    .orderBy(deviceApprovals.requestedAt)
  return { pending: rows }
})
```

- [ ] **Step 2: Create `useDeviceApprovals` composable**

```ts
import { useQuery, useQueryClient } from '@tanstack/vue-query'

export function useDeviceApprovals() {
  const qc = useQueryClient()

  const pending = useQuery({
    queryKey: ['device-approvals', 'pending'],
    queryFn: () => $fetch('/api/auth/device-approvals').then((r: any) => r.pending),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  async function decide(id: string, decision: 'approve' | 'reject') {
    // 1. Fetch challenge.
    const ch = await $fetch(`/api/auth/device-approvals/${id}/challenge`, {
      method: 'GET', params: { decision },
    })
    // 2. Convert base64url challenge to Uint8Array for WebAuthn.
    const challengeBytes = Uint8Array.from(atob(ch.challenge.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0))
    // 3. Step-up WebAuthn.
    const cred: any = await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes,
        allowCredentials: ch.allowCredentials.map((c: any) => ({
          id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), x => x.charCodeAt(0)),
          type: 'public-key', transports: c.transports,
        })),
        userVerification: 'required',
      },
    })
    const assertion = {
      signature: arrayBufferToBase64(cred.response.signature),
      clientDataJSON: arrayBufferToBase64(cred.response.clientDataJSON),
      authenticatorData: arrayBufferToBase64(cred.response.authenticatorData),
    }
    // 4. POST decide.
    const res = await $fetch(`/api/auth/device-approvals/${id}/decide`, {
      method: 'POST', body: { decisionPayload: ch.decisionPayload, assertion },
    })
    await qc.invalidateQueries({ queryKey: ['device-approvals'] })
    return res
  }

  return { pending, decide }
}

function arrayBufferToBase64(ab: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(ab)))
}
```

- [ ] **Step 3: Create waiting page**

`app/pages/login/waiting.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const route = useRoute()
const approvalId = route.query.approval as string
const status = ref<'waiting' | 'approved' | 'rejected' | 'expired'>('waiting')
const onboardingToken = ref<string | null>(null)

let timer: any
onMounted(() => {
  const tick = async () => {
    try {
      const res: any = await $fetch(`/api/auth/device-approvals/${approvalId}`)
      status.value = res.status
      if (res.status === 'approved' && res.onboardingSessionToken) {
        onboardingToken.value = res.onboardingSessionToken
        document.cookie = `comando.session=${res.onboardingSessionToken}; path=/; SameSite=Lax`
        await navigateTo('/onboarding/passkey')
      }
    } catch { /* keep polling */ }
  }
  tick()
  timer = setInterval(tick, 3000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <UContainer class="max-w-md py-12 text-center space-y-4">
    <h1 class="text-xl font-semibold">Aguardando aprovação</h1>
    <p v-if="status === 'waiting'" class="text-gray-600">
      Aprove este dispositivo no seu aparelho de confiança. Pode levar alguns instantes…
    </p>
    <p v-else-if="status === 'rejected'" class="text-red-600">Acesso negado.</p>
    <p v-else-if="status === 'expired'" class="text-amber-700">Pedido expirou.</p>
  </UContainer>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(auth): waiting page + useDeviceApprovals composable"
```

---

### Task 14: Device approval banner + settings page

**Files:**
- Create: `app/components/auth/DeviceApprovalBanner.vue`
- Create: `app/pages/settings/devices.vue`
- Modify: `app/layouts/default.vue` to render banner

- [ ] **Step 1: Create banner component**

`app/components/auth/DeviceApprovalBanner.vue`:

```vue
<script setup lang="ts">
const { pending, decide } = useDeviceApprovals()
const busy = ref<string | null>(null)
const err = ref('')

async function onDecide(id: string, decision: 'approve' | 'reject') {
  busy.value = id; err.value = ''
  try { await decide(id, decision) }
  catch (e: any) { err.value = e?.message ?? 'Falha.' }
  finally { busy.value = null }
}
</script>

<template>
  <div v-if="pending.data.value?.length" class="bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm">
    <div v-for="a in pending.data.value" :key="a.id" class="flex items-center gap-3">
      <span>⚠ Novo dispositivo pediu acesso ({{ a.requestUserAgent }}, {{ a.requestIp }})</span>
      <UButton size="xs" :loading="busy === a.id" @click="onDecide(a.id, 'approve')">Aprovar</UButton>
      <UButton size="xs" color="red" variant="soft" :loading="busy === a.id" @click="onDecide(a.id, 'reject')">Rejeitar</UButton>
    </div>
    <p v-if="err" class="text-red-700 mt-1">{{ err }}</p>
  </div>
</template>
```

- [ ] **Step 2: Create `app/pages/settings/devices.vue`** — lists user's passkeys + approvals history

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { data: passkeys } = await useFetch('/api/auth/passkeys')
const { data: history } = await useFetch('/api/auth/device-approvals/history')
</script>

<template>
  <UContainer class="py-6 space-y-8">
    <section>
      <h2 class="text-lg font-semibold mb-3">Passkeys deste dispositivo e outros</h2>
      <ul>
        <li v-for="p in passkeys" :key="p.id" class="py-2 border-b">
          <div>{{ p.deviceType ?? 'Dispositivo' }} · criado em {{ p.createdAt }}</div>
        </li>
      </ul>
    </section>
    <section>
      <h2 class="text-lg font-semibold mb-3">Histórico de aprovações</h2>
      <ul>
        <li v-for="a in history" :key="a.id" class="py-2 border-b text-sm">
          <div>{{ a.status }} · {{ a.requestUserAgent }} · {{ a.requestedAt }}</div>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
```

- [ ] **Step 3: Create `server/api/auth/passkeys.get.ts` and `/history.get.ts`** (simple reads filtered by user)

- [ ] **Step 4: Modify `app/layouts/default.vue`** to include `<DeviceApprovalBanner />` above the main content (the full default layout is created in Task 29; for now the banner sits in a minimal layout)

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(auth): device approval banner + settings/devices page"
```

---

## Milestone E — Audit log + timeline (Tasks 15–17)

### Task 15: `audit_log` schema + `auditedUpdate` helper

**Files:**
- Create: `server/db/schema/audit.ts`
- Modify: `server/db/schema/index.ts`
- Create: `server/utils/audit.ts`
- Create: `tests/unit/audit-diff.test.ts`
- Create: `tests/integration/audit.test.ts`

- [ ] **Step 1: Create audit schema**

`server/db/schema/audit.ts`:

```ts
import { bigserial, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const auditAction = pgEnum('audit_action', [
  'create', 'update', 'delete', 'archive', 'restore',
  'reassign', 'complete', 'uncomplete', 'approve', 'reject',
])

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: auditAction('action').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  changes: jsonb('changes'),
  context: jsonb('context'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
})
```

Indexes added in migration SQL manually (drizzle-kit may or may not pick them up from schema hints — verify):

```sql
CREATE INDEX audit_log_entity_idx ON audit_log(entity_type, entity_id, at DESC);
CREATE INDEX audit_log_actor_idx  ON audit_log(actor_user_id, at DESC);
```

- [ ] **Step 2: Export + migrate**

Append to `server/db/schema/index.ts`:

```ts
export * from './audit'
```

Then:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Manually add the two index statements into the generated SQL if drizzle-kit didn't infer them.

- [ ] **Step 3: Write failing unit test for `diffFields`**

`tests/unit/audit-diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { diffFields, inferAction } from '~/server/utils/audit'

describe('diffFields', () => {
  it('returns only changed fields with from/to', () => {
    const a = { title: 'x', done: false, horizon: 'core30', updatedAt: new Date('2026-01-01') }
    const b = { title: 'y', done: false, horizon: 'core60', updatedAt: new Date('2026-01-02') }
    const d = diffFields(a, b, { ignore: ['updatedAt'] })
    expect(d).toEqual({
      title: { from: 'x', to: 'y' },
      horizon: { from: 'core30', to: 'core60' },
    })
  })
})

describe('inferAction', () => {
  it('infers complete / uncomplete from done flag', () => {
    expect(inferAction({ done: true },  { done: false, archived: false }, { done: true, archived: false })).toBe('complete')
    expect(inferAction({ done: false }, { done: true,  archived: false }, { done: false, archived: false })).toBe('uncomplete')
  })
  it('infers archive / restore', () => {
    expect(inferAction({ archived: true },  { archived: false }, { archived: true })).toBe('archive')
    expect(inferAction({ archived: false }, { archived: true },  { archived: false })).toBe('restore')
  })
  it('infers reassign when delegate_person_id changed', () => {
    expect(inferAction({ delegatePersonId: 'p2' }, { delegatePersonId: 'p1' }, { delegatePersonId: 'p2' })).toBe('reassign')
  })
  it('falls back to update', () => {
    expect(inferAction({ title: 'y' }, { title: 'x' }, { title: 'y' })).toBe('update')
  })
})
```

- [ ] **Step 4: Run — expect FAIL**

- [ ] **Step 5: Implement `server/utils/audit.ts`**

```ts
import { eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { auditLog } from '~/server/db/schema'
import type { Db } from './db'

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'archive' | 'restore'
  | 'reassign' | 'complete' | 'uncomplete' | 'approve' | 'reject'

export function diffFields(
  before: Record<string, any>,
  after: Record<string, any>,
  opts: { ignore?: string[] } = {},
): Record<string, { from: unknown; to: unknown }> {
  const ignore = new Set([...(opts.ignore ?? []), 'updatedAt', 'updated_at', 'atualizada_em'])
  const out: Record<string, any> = {}
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const k of keys) {
    if (ignore.has(k)) continue
    const a = (before ?? {})[k]
    const b = (after ?? {})[k]
    if (!deepEqual(a, b)) out[k] = { from: a, to: b }
  }
  return out
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

export function inferAction(patch: Record<string, any>, before: any, after: any): AuditAction {
  if ('done' in patch) {
    if (after.done && !before.done) return 'complete'
    if (!after.done && before.done) return 'uncomplete'
  }
  if ('archived' in patch) {
    if (after.archived && !before.archived) return 'archive'
    if (!after.archived && before.archived) return 'restore'
  }
  if ('delegatePersonId' in patch || 'delegate_person_id' in patch) return 'reassign'
  return 'update'
}

export async function writeAudit(tx: Db | any, args: {
  entity: string; entityId: string; action: AuditAction;
  actorUserId: string | null;
  changes?: Record<string, any> | null;
  context?: Record<string, any> | null;
}) {
  await tx.insert(auditLog).values({
    entityType: args.entity,
    entityId: args.entityId,
    action: args.action,
    actorUserId: args.actorUserId,
    changes: args.changes ?? null,
    context: args.context ?? null,
  })
}

export async function auditedUpdate<T>(
  tx: any, table: PgTable, id: string, actorUserId: string,
  patch: Record<string, any>, opts: { entity: string; context?: any } = { entity: '' },
): Promise<T> {
  const [before] = await tx.select().from(table).where(eq((table as any).id, id))
  if (!before) throw new Error(`auditedUpdate: ${opts.entity}#${id} not found`)
  const [after] = await tx.update(table).set(patch).where(eq((table as any).id, id)).returning()
  const changes = diffFields(before, after)
  if (Object.keys(changes).length === 0) return after as T
  await writeAudit(tx, {
    entity: opts.entity || (table as any)._.name,
    entityId: id,
    action: inferAction(patch, before, after),
    actorUserId,
    changes,
    context: opts.context,
  })
  return after as T
}
```

- [ ] **Step 6: Run unit tests — expect PASS**

- [ ] **Step 7: Add an integration smoke test**

`tests/integration/audit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useTestDb, seedUser } from './helpers'
import { auditedUpdate } from '~/server/utils/audit'
import { users } from '~/server/db/schema'

describe('auditedUpdate', () => {
  it('writes a diff row when something changes', async () => {
    const { db, context } = await useTestDb()
    const userId = await seedUser(db, { email: 'a@a' })
    await db.transaction(async (tx) => {
      await auditedUpdate<any>(tx, users, userId, userId, { name: 'New Name' }, { entity: 'user' })
    })
    const rows = await db.select().from(context.schema.auditLog)
    expect(rows).toHaveLength(1)
    expect(rows[0].entityType).toBe('user')
    expect(rows[0].action).toBe('update')
    expect((rows[0].changes as any).name).toEqual({ from: expect.any(String), to: 'New Name' })
  })

  it('writes nothing when patch is a no-op', async () => {
    const { db, context } = await useTestDb()
    const userId = await seedUser(db, { email: 'b@b', name: 'Same' })
    await db.transaction(async (tx) => {
      await auditedUpdate<any>(tx, users, userId, userId, { name: 'Same' }, { entity: 'user' })
    })
    const rows = await db.select().from(context.schema.auditLog)
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(audit): schema + diffFields + auditedUpdate helper"
```

---

### Task 16: Custom ESLint rule `no-raw-db-update`

**Files:**
- Create: `eslint-rules/no-raw-db-update.js`
- Modify: `eslint.config.mjs`
- Create: `tests/unit/eslint-rule.test.js`

- [ ] **Step 1: Install eslint + test deps**

```bash
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/utils @eslint/js
```

- [ ] **Step 2: Write the rule**

`eslint-rules/no-raw-db-update.js`:

```js
// Forbids `.update(table)` and `.delete(table)` calls outside server/utils/audit.ts.
// Forces all mutations through auditedUpdate / writeAudit for consistent audit trail.
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow raw db.update/delete outside server/utils/audit.ts' },
    messages: {
      forbidden: 'Raw `{{method}}` is forbidden here. Use auditedUpdate / writeAudit in server/utils/audit.ts.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename()
    if (filename.endsWith('server/utils/audit.ts')) return {}
    // Allow inside tests directory.
    if (/[\\/]tests[\\/]/.test(filename)) return {}
    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const name = callee.property.name
        if (name !== 'update' && name !== 'delete') return
        // Heuristic: the object is a Drizzle db or tx variable. Flag when the caller
        // references identifiers commonly named `db`, `tx`, `database`.
        const obj = callee.object
        const objName = obj.type === 'Identifier' ? obj.name
          : (obj.type === 'CallExpression' && obj.callee.type === 'Identifier') ? obj.callee.name
          : null
        if (!objName) return
        if (['db', 'tx', 'database'].includes(objName) || /^use[A-Z]/.test(objName)) {
          context.report({ node, messageId: 'forbidden', data: { method: `.${name}(...)` } })
        }
      },
    }
  },
}
```

- [ ] **Step 3: Register in `eslint.config.mjs`**

```js
import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import noRawDbUpdate from './eslint-rules/no-raw-db-update.js'

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: { parser: tsParser },
    plugins: { local: { rules: { 'no-raw-db-update': noRawDbUpdate } } },
    rules: { 'local/no-raw-db-update': 'error' },
  },
  {
    files: ['server/utils/audit.ts', 'tests/**'],
    rules: { 'local/no-raw-db-update': 'off' },
  },
]
```

- [ ] **Step 4: Run lint on current repo — expect all current code passes**

```bash
pnpm lint
```

- [ ] **Step 5: Add a failure fixture test**

Create `tests/unit/eslint-fixtures/raw-update.ts`:

```ts
import { useDb } from '~/server/utils/db'
export async function bad(event: any, id: string) {
  const db = useDb(event)
  // @ts-expect-error — ESLint rule catches this line
  await db.update({} as any).set({ a: 1 }).where(null as any)
}
```

Run `pnpm lint tests/unit/eslint-fixtures/raw-update.ts` — **expect lint error** `local/no-raw-db-update`.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore(lint): custom rule to enforce auditedUpdate for all mutations"
```

---

### Task 17: Audit timeline endpoint + access guard

**Files:**
- Create: `server/api/audit/index.get.ts`
- Create: `server/utils/accessFilter.ts` (stub; fully fleshed in Task 23)
- Create: `tests/integration/audit-timeline.test.ts`

- [ ] **Step 1: Stub `accessFilter.ts`**

```ts
// server/utils/accessFilter.ts
import { and, eq, exists, or, sql } from 'drizzle-orm'
import { tasks, people, users } from '~/server/db/schema'

export function canSeeEntity(args: { entity: string; entityId: string; userId: string }) {
  // Full implementation in Task 23. For now we only need `task`.
  return sql`true`
}
```

Replace in Task 23.

- [ ] **Step 2: Create endpoint**

`server/api/audit/index.get.ts`:

```ts
import { z } from 'zod'
import { and, eq, or, inArray, asc } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { auditLog, tasks, checklistItems, taskAnnotations, people } from '~/server/db/schema'
import { createApiError, ErrCode } from '~/server/utils/errors'

const querySchema = z.object({
  entity: z.enum(['task']), // extend for Phase 2
  id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = querySchema.parse(getQuery(event))
  const db = useDb(event)

  if (q.entity === 'task') {
    // Access check: user must be owner or delegate of this task.
    const [t] = await db.select().from(tasks).where(eq(tasks.id, q.id))
    if (!t) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
    const isOwner = t.ownerUserId === user.id
    let isDelegate = false
    if (!isOwner && t.delegatePersonId) {
      const [p] = await db.select().from(people).where(eq(people.id, t.delegatePersonId))
      isDelegate = p?.linkedUserId === user.id
    }
    if (!isOwner && !isDelegate) throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')

    // Gather ids: task + its checklist + its annotations.
    const cis = await db.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.taskId, q.id))
    const ans = await db.select({ id: taskAnnotations.id }).from(taskAnnotations).where(eq(taskAnnotations.taskId, q.id))
    const ids = [q.id, ...cis.map(r => r.id), ...ans.map(r => r.id)]

    const entries = await db.select().from(auditLog)
      .where(or(
        and(eq(auditLog.entityType, 'task'),            eq(auditLog.entityId, q.id)),
        and(eq(auditLog.entityType, 'checklist_item'),  inArray(auditLog.entityId, cis.length ? cis.map(c => c.id) : ['00000000-0000-0000-0000-000000000000'])),
        and(eq(auditLog.entityType, 'task_annotation'), inArray(auditLog.entityId, ans.length ? ans.map(a => a.id) : ['00000000-0000-0000-0000-000000000000'])),
      ))
      .orderBy(asc(auditLog.at))

    return { entries }
  }

  throw createApiError(ErrCode.BAD_REQUEST, 'Entidade não suportada ainda.')
})
```

- [ ] **Step 3: Write integration test**

`tests/integration/audit-timeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useTestDb, seedUser, seedSession, createTask } from './helpers'

describe('GET /api/audit?entity=task&id=:id', () => {
  it('returns events sorted chronologically for owner', async () => {
    const { db, request } = await useTestDb()
    const uid = await seedUser(db, { email: 'o@o', role: 'owner' })
    const { sessionToken } = await seedSession(db, { userId: uid })
    const taskId = await createTask(db, { ownerUserId: uid, createdByUserId: uid, title: 'T' })
    // Update it once.
    await request(`/api/tasks/${taskId}`, {
      method: 'PATCH', body: { title: 'T2' },
      headers: { Cookie: `comando.session=${sessionToken}` },
    })
    const res = await request(`/api/audit?entity=task&id=${taskId}`, {
      method: 'GET', headers: { Cookie: `comando.session=${sessionToken}` },
    })
    expect(res.status).toBe(200)
    expect(res.body.entries.length).toBeGreaterThanOrEqual(2)   // create + update
    expect(res.body.entries[0].action).toBe('create')
  })

  it('403 for user with no access to the task', async () => {
    const { db, request } = await useTestDb()
    const owner = await seedUser(db, { email: 'o@o' })
    const taskId = await createTask(db, { ownerUserId: owner, createdByUserId: owner, title: 'T' })
    const other = await seedUser(db, { email: 'x@x' })
    const { sessionToken } = await seedSession(db, { userId: other })
    const res = await request(`/api/audit?entity=task&id=${taskId}`, {
      method: 'GET', headers: { Cookie: `comando.session=${sessionToken}` },
    })
    expect(res.status).toBe(403)
  })
})
```

This test depends on tasks endpoints being implemented (Task 24). Mark the test pending and run once Task 24 is complete.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(audit): timeline endpoint with task access guard"
```

---

## Milestone F — People, invitations, assistant (Tasks 18–21)

### Task 18: `people` + `person_invitations` schema

**Files:**
- Create: `server/db/schema/people.ts`
- Modify: `server/db/schema/index.ts`

- [ ] **Step 1: Create schema**

`server/db/schema/people.ts`:

```ts
import { pgTable, uuid, text, boolean, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { sql } from 'drizzle-orm'

export const invitationStatus = pgEnum('invitation_status', [
  'pending', 'accepted', 'expired', 'revoked',
])

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  linkedUserId: uuid('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
  isAssistant: boolean('is_assistant').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('people_owner_idx').on(t.ownerUserId),
  linkedIdx: index('people_linked_idx').on(t.linkedUserId),
  // Partial unique: at most one assistant per owner.
  oneAssistantPerOwner: uniqueIndex('people_one_assistant_per_owner')
    .on(t.ownerUserId).where(sql`is_assistant = true`),
}))

export const personInvitations = pgTable('person_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  status: invitationStatus('status').notNull().default('pending'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  invitedByUserId: uuid('invited_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
})
```

- [ ] **Step 2: Export + migrate**

```ts
// server/db/schema/index.ts
export * from './people'
```

```bash
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(db): people and person_invitations schema"
```

---

### Task 19: People CRUD + set-assistant endpoints

**Files:**
- Create: `server/api/people/index.get.ts`
- Create: `server/api/people/index.post.ts`
- Create: `server/api/people/[id].patch.ts`
- Create: `server/api/people/[id].delete.ts`
- Create: `server/api/people/[id]/assistant.post.ts`
- Create: `tests/integration/people.test.ts`

- [ ] **Step 1: Write failing integration tests**

`tests/integration/people.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useTestDb, seedUser, seedSession } from './helpers'

describe('People CRUD + assistant', () => {
  it('creates a person and lists it', async () => {
    const { db, request } = await useTestDb()
    const uid = await seedUser(db, { email: 'o@o', role: 'owner' })
    const { sessionToken } = await seedSession(db, { userId: uid })
    const h = { Cookie: `comando.session=${sessionToken}` }

    const create = await request('/api/people', { method: 'POST', body: { name: 'Maria' }, headers: h })
    expect(create.status).toBe(201)
    expect(create.body.id).toBeTypeOf('string')

    const list = await request('/api/people', { method: 'GET', headers: h })
    expect(list.body.people).toHaveLength(1)
    expect(list.body.people[0].name).toBe('Maria')
  })

  it('enforces single assistant per owner', async () => {
    const { db, request } = await useTestDb()
    const uid = await seedUser(db, { email: 'o@o', role: 'owner' })
    const { sessionToken } = await seedSession(db, { userId: uid })
    const h = { Cookie: `comando.session=${sessionToken}` }

    const a = (await request('/api/people', { method: 'POST', body: { name: 'A' }, headers: h })).body.id
    const b = (await request('/api/people', { method: 'POST', body: { name: 'B' }, headers: h })).body.id

    const ra = await request(`/api/people/${a}/assistant`, { method: 'POST', headers: h })
    expect(ra.status).toBe(200)
    // Setting B as assistant unsets A automatically.
    const rb = await request(`/api/people/${b}/assistant`, { method: 'POST', headers: h })
    expect(rb.status).toBe(200)
    const list = await request('/api/people', { method: 'GET', headers: h })
    const assistants = list.body.people.filter((p: any) => p.isAssistant)
    expect(assistants).toHaveLength(1)
    expect(assistants[0].id).toBe(b)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement endpoints**

`server/api/people/index.get.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { people } from '~/server/db/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const rows = await db.select().from(people)
    .where(and(eq(people.ownerUserId, user.id), eq(people.archived, false)))
    .orderBy(people.name)
  return { people: rows }
})
```

`server/api/people/index.post.ts`:

```ts
import { z } from 'zod'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { people } from '~/server/db/schema'
import { writeAudit } from '~/server/utils/audit'

const bodySchema = z.object({ name: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  const created = await db.transaction(async (tx) => {
    const [p] = await tx.insert(people).values({
      ownerUserId: user.id, name: body.name,
    }).returning()
    await writeAudit(tx, {
      entity: 'person', entityId: p.id, action: 'create',
      actorUserId: user.id, changes: { create: p },
    })
    return p
  })
  setResponseStatus(event, 201)
  return created
})
```

`server/api/people/[id].patch.ts`:

```ts
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { people } from '~/server/db/schema'
import { auditedUpdate } from '~/server/utils/audit'
import { createApiError, ErrCode } from '~/server/utils/errors'

const bodySchema = z.object({ name: z.string().min(1).optional() })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  const [p] = await db.select().from(people).where(and(eq(people.id, id), eq(people.ownerUserId, user.id)))
  if (!p) throw createApiError(ErrCode.NOT_FOUND, 'Pessoa não encontrada.')
  return await db.transaction((tx) => auditedUpdate(tx, people, id, user.id, body, { entity: 'person' }))
})
```

`server/api/people/[id].delete.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { people } from '~/server/db/schema'
import { auditedUpdate } from '~/server/utils/audit'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb(event)
  const [p] = await db.select().from(people).where(and(eq(people.id, id), eq(people.ownerUserId, user.id)))
  if (!p) throw createApiError(ErrCode.NOT_FOUND, 'Pessoa não encontrada.')
  return await db.transaction((tx) => auditedUpdate(tx, people, id, user.id, { archived: true }, { entity: 'person' }))
})
```

`server/api/people/[id]/assistant.post.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { people } from '~/server/db/schema'
import { writeAudit } from '~/server/utils/audit'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb(event)
  const [target] = await db.select().from(people).where(and(eq(people.id, id), eq(people.ownerUserId, user.id)))
  if (!target) throw createApiError(ErrCode.NOT_FOUND, 'Pessoa não encontrada.')
  if (!target.linkedUserId) throw createApiError(ErrCode.BAD_REQUEST, 'Pessoa precisa ter conta para ser assistente.')

  return db.transaction(async (tx) => {
    // Demote previous assistant (if any).
    const [previous] = await tx.select().from(people)
      .where(and(eq(people.ownerUserId, user.id), eq(people.isAssistant, true)))
    if (previous && previous.id !== id) {
      await tx.update(people).set({ isAssistant: false, updatedAt: new Date() }).where(eq(people.id, previous.id))
      await writeAudit(tx, {
        entity: 'person', entityId: previous.id, action: 'update',
        actorUserId: user.id,
        changes: { isAssistant: { from: true, to: false } },
        context: { reason: 'demoted when another assistant was set' },
      })
    }
    // Promote target.
    const [updated] = await tx.update(people).set({ isAssistant: true, updatedAt: new Date() })
      .where(eq(people.id, id)).returning()
    await writeAudit(tx, {
      entity: 'person', entityId: id, action: 'update',
      actorUserId: user.id,
      changes: { isAssistant: { from: false, to: true } },
    })
    return updated
  })
})
```

Note: the `update` calls in `/assistant.post.ts` are inside a transaction that writes audit manually, so they're acceptable by the lint rule (the rule currently flags by variable name; `tx.update` inside this specific file *should* be flagged too — we make an explicit exception by adding `/* eslint-disable local/no-raw-db-update */` at the top with a comment pointing to the audit calls). **Alternative**: refactor to use `auditedUpdate` consistently.

Refactor to use `auditedUpdate`:

```ts
// inside transaction
if (previous && previous.id !== id) {
  await auditedUpdate(tx, people, previous.id, user.id, { isAssistant: false }, {
    entity: 'person', context: { reason: 'demoted when another assistant was set' },
  })
}
const updated = await auditedUpdate(tx, people, id, user.id, { isAssistant: true }, { entity: 'person' })
return updated
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(people): CRUD + single-assistant enforcement with audit"
```

---

### Task 20: Invite + accept flow

**Files:**
- Create: `server/api/people/[id]/invite.post.ts`
- Create: `server/api/invitations/[token]/accept.post.ts`
- Create: `app/pages/invite/[token].vue`
- Create: `tests/integration/invite.test.ts`

- [ ] **Step 1: Write failing test**

`tests/integration/invite.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useTestDb, seedUser, seedSession } from './helpers'

describe('Invite + accept', () => {
  it('invites a person and accepts via token', async () => {
    const { db, request, context } = await useTestDb()
    const owner = await seedUser(db, { email: 'o@o', role: 'owner' })
    const { sessionToken } = await seedSession(db, { userId: owner })
    const h = { Cookie: `comando.session=${sessionToken}` }

    const p = (await request('/api/people', { method: 'POST', body: { name: 'Maria' }, headers: h })).body

    const inv = await request(`/api/people/${p.id}/invite`, {
      method: 'POST', body: { email: 'maria@example.com' }, headers: h,
    })
    expect(inv.status).toBe(200)

    const [row] = await db.select().from(context.schema.personInvitations)
    expect(row.status).toBe('pending')

    // Simulate accept — we don't have the raw token in DB (it's hashed), so
    // in-test we expose it via a helper; in reality it's in the email link.
    // The invite endpoint returns the token in test mode via X-Test-Token header.
    const token = inv.body._testToken
    const accept = await request(`/api/invitations/${token}/accept`, {
      method: 'POST', body: { name: 'Maria Souza' },
    })
    expect(accept.status).toBe(200)
    expect(accept.body.session.purpose).toBe('bootstrap')

    const updated = await db.select().from(context.schema.people)
      .where(context.eq(context.schema.people.id, p.id))
    expect(updated[0].linkedUserId).not.toBeNull()
  })
})
```

- [ ] **Step 2: Implement `/invite.post.ts`**

```ts
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { useMailer } from '~/server/utils/mailer'
import { people, personInvitations, users } from '~/server/db/schema'
import { createApiError, ErrCode } from '~/server/utils/errors'
import { createHash, randomBytes } from 'node:crypto'

const bodySchema = z.object({ email: z.string().email() })
const INVITATION_TTL_DAYS = 7

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  const config = useRuntimeConfig(event)

  const [p] = await db.select().from(people).where(and(eq(people.id, id), eq(people.ownerUserId, user.id)))
  if (!p) throw createApiError(ErrCode.NOT_FOUND, 'Pessoa não encontrada.')
  if (p.linkedUserId) throw createApiError(ErrCode.BAD_REQUEST, 'Pessoa já tem conta vinculada.')

  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const [invitation, linkedUser] = await db.transaction(async (tx) => {
    // Create or reuse a user.
    let [u] = await tx.select().from(users).where(eq(users.email, body.email))
    if (!u) {
      [u] = await tx.insert(users).values({
        email: body.email, name: p.name, role: 'delegate',
      }).returning()
    }
    await tx.update(people).set({ linkedUserId: u.id, updatedAt: new Date() })
      .where(eq(people.id, p.id))
    const [inv] = await tx.insert(personInvitations).values({
      personId: p.id, email: body.email, tokenHash,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86400_000),
      invitedByUserId: user.id,
    }).returning()
    return [inv, u]
  })

  const link = `${config.public.siteUrl}/invite/${token}`
  await useMailer(event).send({
    to: body.email,
    subject: 'Você foi convidado para o Comando',
    text: `${user.name} convidou você. Acesse: ${link}\n\nO link expira em ${INVITATION_TTL_DAYS} dias.`,
  })

  const res: any = { ok: true, invitationId: invitation.id }
  if (process.env.NODE_ENV === 'test') res._testToken = token
  return res
})
```

Note: the `tx.update(people)` on line setting `linkedUserId` should also go through `auditedUpdate` — refactor:

```ts
await auditedUpdate(tx, people, p.id, user.id, { linkedUserId: u.id }, {
  entity: 'person',
  context: { via: 'invite', invited_email: body.email },
})
```

- [ ] **Step 3: Implement `/accept.post.ts`**

```ts
import { z } from 'zod'
import { and, eq, gt } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { personInvitations, users, sessions } from '~/server/db/schema'
import { createApiError, ErrCode } from '~/server/utils/errors'
import { createHash } from 'node:crypto'

const bodySchema = z.object({ name: z.string().min(1).optional() })

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const now = new Date()
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(personInvitations)
      .where(and(
        eq(personInvitations.tokenHash, tokenHash),
        eq(personInvitations.status, 'pending'),
        gt(personInvitations.expiresAt, now),
      ))
    if (!inv) throw createApiError(ErrCode.INVITATION_EXPIRED, 'Convite inválido ou expirado.')

    const [u] = await tx.select().from(users).where(eq(users.email, inv.email))
    if (!u) throw createApiError(ErrCode.NOT_FOUND, 'Conta não encontrada.')

    await tx.update(personInvitations).set({ status: 'accepted', acceptedAt: now })
      .where(eq(personInvitations.id, inv.id))

    if (body.name) {
      await tx.update(users).set({ name: body.name, emailVerified: true, updatedAt: now })
        .where(eq(users.id, u.id))
    } else {
      await tx.update(users).set({ emailVerified: true, updatedAt: now }).where(eq(users.id, u.id))
    }

    // Open a bootstrap session for passkey registration.
    const [session] = await tx.insert(sessions).values({
      userId: u.id, token: 'onb_' + crypto.randomUUID(),
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    }).returning()

    setCookie(event, 'comando.session', session.token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 15 * 60,
    })

    return { session: { purpose: 'bootstrap', userId: u.id } }
  })
})
```

Same refactor note: replace the raw `tx.update(...)` calls with `auditedUpdate` calls (entity='invitation', 'user').

- [ ] **Step 4: Create `app/pages/invite/[token].vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const route = useRoute()
const token = route.params.token as string
const name = ref('')
const err = ref('')
const busy = ref(false)

async function onAccept() {
  busy.value = true; err.value = ''
  try {
    await $fetch(`/api/invitations/${token}/accept`, { method: 'POST', body: { name: name.value } })
    await navigateTo('/onboarding/passkey')
  } catch (e: any) {
    err.value = e?.data?.error?.message ?? 'Falha ao aceitar convite.'
  } finally { busy.value = false }
}
</script>

<template>
  <UContainer class="max-w-md py-12 space-y-4">
    <h1 class="text-xl font-semibold">Aceitar convite</h1>
    <UInput v-model="name" placeholder="Seu nome" />
    <UButton :loading="busy" block @click="onAccept">Aceitar e cadastrar passkey</UButton>
    <p v-if="err" class="text-red-600 text-sm">{{ err }}</p>
  </UContainer>
</template>
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(people): invite endpoint + accept flow with bootstrap session"
```

---

### Task 21: Settings/people page

**Files:**
- Create: `app/pages/settings/people.vue`
- Create: `app/composables/usePeople.ts`

- [ ] **Step 1: Create composable**

`app/composables/usePeople.ts`:

```ts
import { useQuery, useQueryClient } from '@tanstack/vue-query'

export function usePeople() {
  const qc = useQueryClient()

  const list = useQuery({
    queryKey: ['people'],
    queryFn: () => $fetch('/api/people').then((r: any) => r.people),
  })

  async function create(name: string) {
    await $fetch('/api/people', { method: 'POST', body: { name } })
    await qc.invalidateQueries({ queryKey: ['people'] })
  }

  async function invite(id: string, email: string) {
    await $fetch(`/api/people/${id}/invite`, { method: 'POST', body: { email } })
    await qc.invalidateQueries({ queryKey: ['people'] })
  }

  async function setAssistant(id: string) {
    await $fetch(`/api/people/${id}/assistant`, { method: 'POST' })
    await qc.invalidateQueries({ queryKey: ['people'] })
  }

  async function remove(id: string) {
    await $fetch(`/api/people/${id}`, { method: 'DELETE' })
    await qc.invalidateQueries({ queryKey: ['people'] })
  }

  return { list, create, invite, setAssistant, remove }
}
```

- [ ] **Step 2: Create page**

`app/pages/settings/people.vue`:

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { list, create, invite, setAssistant, remove } = usePeople()
const newName = ref('')
const inviteFor = ref<string | null>(null)
const inviteEmail = ref('')

async function onCreate() {
  if (!newName.value.trim()) return
  await create(newName.value.trim()); newName.value = ''
}

async function onInvite(id: string) {
  if (!inviteEmail.value.trim()) return
  await invite(id, inviteEmail.value.trim())
  inviteFor.value = null; inviteEmail.value = ''
}
</script>

<template>
  <UContainer class="py-6 space-y-6">
    <h1 class="text-xl font-semibold">Pessoas</h1>
    <div class="flex gap-2">
      <UInput v-model="newName" placeholder="Nome novo" class="flex-1" />
      <UButton :disabled="!newName" @click="onCreate">Adicionar</UButton>
    </div>
    <ul class="space-y-2">
      <li v-for="p in list.data.value ?? []" :key="p.id" class="border rounded p-3 flex items-center gap-3">
        <span class="flex-1">
          {{ p.name }}
          <span v-if="p.linkedUserId" class="text-xs text-green-700 ml-2">conta vinculada</span>
          <span v-else class="text-xs text-gray-500 ml-2">pendente</span>
          <span v-if="p.isAssistant" class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-2">Assistente</span>
        </span>
        <UButton v-if="!p.linkedUserId" size="xs" @click="inviteFor = p.id">Convidar</UButton>
        <UButton v-if="p.linkedUserId && !p.isAssistant" size="xs" variant="soft" @click="setAssistant(p.id)">Tornar assistente</UButton>
        <UButton size="xs" color="red" variant="ghost" @click="remove(p.id)">Arquivar</UButton>
      </li>
    </ul>

    <UModal v-model="inviteFor">
      <div class="p-4 space-y-3">
        <h2 class="font-semibold">Enviar convite</h2>
        <UInput v-model="inviteEmail" type="email" placeholder="email@exemplo.com" />
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="inviteFor = null">Cancelar</UButton>
          <UButton :disabled="!inviteEmail" @click="onInvite(inviteFor!)">Enviar</UButton>
        </div>
      </div>
    </UModal>
  </UContainer>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(people): settings/people page with create/invite/assistant"
```

---

## Milestone G — Tasks, checklist, annotations (Tasks 22–27)

### Task 22: `tasks`, `checklist_items`, `task_annotations` schema

**Files:**
- Create: `server/db/schema/tasks.ts`
- Modify: `server/db/schema/index.ts`

- [ ] **Step 1: Create schema**

`server/db/schema/tasks.ts`:

```ts
import { pgTable, uuid, text, boolean, timestamp, pgEnum, index, integer, date, time } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { people } from './people'

export const taskHorizon = pgEnum('task_horizon', [
  'core30', 'core60', 'core90', 'micro', 'backlog', 'hibernating',
])
export const taskType = pgEnum('task_type', ['ceo', 'delegate', 'personal'])

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  delegatePersonId: uuid('delegate_person_id').references(() => people.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  horizon: taskHorizon('horizon').notNull().default('core30'),
  type: taskType('type').notNull().default('ceo'),
  // project_id column is reserved for Phase 2 — nullable, no FK yet.
  projectId: uuid('project_id'),
  scheduledDate: date('scheduled_date'),
  scheduledTime: time('scheduled_time'),
  durationMinutes: integer('duration_minutes'),
  followupActive: boolean('followup_active').notNull().default(false),
  followupDate: date('followup_date'),
  followupHolderPersonId: uuid('followup_holder_person_id').references(() => people.id, { onDelete: 'set null' }),
  done: boolean('done').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('tasks_owner_idx').on(t.ownerUserId, t.archived, t.horizon),
  delegateIdx: index('tasks_delegate_idx').on(t.delegatePersonId),
  schedIdx: index('tasks_scheduled_idx').on(t.scheduledDate),
}))

export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  text: text('text').notNull(),
  done: boolean('done').notNull().default(false),
  doneAt: timestamp('done_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  taskIdx: index('checklist_items_task_idx').on(t.taskId, t.position),
}))

export const taskAnnotations = pgTable('task_annotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  taskTimeIdx: index('task_annotations_task_time_idx').on(t.taskId, t.createdAt),
}))
```

- [ ] **Step 2: Export + migrate**

```ts
export * from './tasks'
```

```bash
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(db): tasks, checklist_items, task_annotations schema"
```

---

### Task 23: `accessFilter` helper (task scoping)

**Files:**
- Modify: `server/utils/accessFilter.ts`
- Create: `tests/unit/accessFilter.test.ts`

- [ ] **Step 1: Write failing unit test**

`tests/unit/accessFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getOperators } from 'drizzle-orm'
import { taskFilter } from '~/server/utils/accessFilter'

describe('taskFilter', () => {
  it('returns a SQL expression that references owner_user_id and delegate join', () => {
    const sql = taskFilter('user-123')
    const str = String((sql as any).queryChunks.map((c: any) => c.value ?? c).join(''))
    expect(str).toMatch(/owner_user_id/)
    expect(str).toMatch(/linked_user_id/)
  })
})
```

- [ ] **Step 2: Implement `accessFilter.ts`**

```ts
import { and, eq, exists, or, sql } from 'drizzle-orm'
import { tasks, people, checklistItems, taskAnnotations } from '~/server/db/schema'

/**
 * Returns a Drizzle `SQL<boolean>` for "the given user can see this task".
 * Caller uses: `db.select().from(tasks).where(taskFilter(userId))`
 */
export function taskFilter(userId: string) {
  return or(
    eq(tasks.ownerUserId, userId),
    exists(
      (sql`SELECT 1 FROM people WHERE people.id = ${tasks.delegatePersonId} AND people.linked_user_id = ${userId}`),
    ),
  )
}

/** Check if user can see a specific task (single-task path). */
export async function canAccessTask(db: any, userId: string, taskId: string) {
  const [row] = await db.select({ id: tasks.id }).from(tasks)
    .leftJoin(people, eq(people.id, tasks.delegatePersonId))
    .where(and(eq(tasks.id, taskId), or(eq(tasks.ownerUserId, userId), eq(people.linkedUserId, userId))))
    .limit(1)
  return !!row
}
```

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(auth): access filter for task visibility"
```

---

### Task 24: Tasks CRUD with type logic + reassign guard

**Files:**
- Create: `server/api/tasks/index.get.ts`
- Create: `server/api/tasks/index.post.ts`
- Create: `server/api/tasks/[id].get.ts`
- Create: `server/api/tasks/[id].patch.ts`
- Create: `server/api/tasks/[id].delete.ts`
- Create: `server/api/tasks/[id]/complete.post.ts`
- Create: `server/api/tasks/[id]/archive.post.ts`
- Create: `server/api/tasks/[id]/reassign.post.ts`
- Create: `tests/integration/tasks.test.ts`

- [ ] **Step 1: Write failing integration tests**

`tests/integration/tasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useTestDb, seedUser, seedSession, createPerson, linkPerson } from './helpers'

describe('Tasks — core CRUD + delegation + permissions', () => {
  it('owner creates task type=ceo; only owner sees it', async () => {
    const { db, request } = await useTestDb()
    const owner = await seedUser(db, { email: 'o@o', role: 'owner' })
    const other = await seedUser(db, { email: 'x@x' })
    const { sessionToken: ownerSess } = await seedSession(db, { userId: owner })
    const { sessionToken: otherSess } = await seedSession(db, { userId: other })

    const created = await request('/api/tasks', {
      method: 'POST',
      body: { title: 'T1', type: 'ceo', horizon: 'core30' },
      headers: { Cookie: `comando.session=${ownerSess}` },
    })
    expect(created.status).toBe(201)

    const mine = await request('/api/tasks', { method: 'GET', headers: { Cookie: `comando.session=${ownerSess}` } })
    expect(mine.body.tasks).toHaveLength(1)

    const notMine = await request('/api/tasks', { method: 'GET', headers: { Cookie: `comando.session=${otherSess}` } })
    expect(notMine.body.tasks).toHaveLength(0)
  })

  it('type=delegate with linked person makes task visible in delegate workspace', async () => {
    const { db, request } = await useTestDb()
    const owner = await seedUser(db, { email: 'o@o', role: 'owner' })
    const delegate = await seedUser(db, { email: 'm@m', role: 'delegate' })
    const person = await createPerson(db, { ownerUserId: owner, name: 'Maria' })
    await linkPerson(db, { personId: person, userId: delegate })
    const { sessionToken: ownerSess } = await seedSession(db, { userId: owner })
    const { sessionToken: delSess } = await seedSession(db, { userId: delegate })

    await request('/api/tasks', {
      method: 'POST',
      body: { title: 'Delegada', type: 'delegate', horizon: 'core30', delegatePersonId: person },
      headers: { Cookie: `comando.session=${ownerSess}` },
    })

    const ownerView = await request('/api/tasks', { method: 'GET', headers: { Cookie: `comando.session=${ownerSess}` } })
    const delView   = await request('/api/tasks', { method: 'GET', headers: { Cookie: `comando.session=${delSess}` } })
    expect(ownerView.body.tasks).toHaveLength(1)
    expect(delView.body.tasks).toHaveLength(1)
    expect(delView.body.tasks[0].title).toBe('Delegada')
  })

  it('type=personal without assistant configured returns ERR_NO_ASSISTANT', async () => {
    const { db, request } = await useTestDb()
    const owner = await seedUser(db, { email: 'o@o', role: 'owner' })
    const { sessionToken } = await seedSession(db, { userId: owner })
    const res = await request('/api/tasks', {
      method: 'POST', body: { title: 'Pessoal', type: 'personal', horizon: 'core30' },
      headers: { Cookie: `comando.session=${sessionToken}` },
    })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ERR_NO_ASSISTANT')
  })

  it('delegate cannot reassign; only creator can', async () => {
    const { db, request } = await useTestDb()
    const owner = await seedUser(db, { email: 'o@o' })
    const delegate = await seedUser(db, { email: 'd@d' })
    const other = await seedUser(db, { email: 'z@z' })
    const pMaria = await createPerson(db, { ownerUserId: owner, name: 'Maria' })
    const pCarlos = await createPerson(db, { ownerUserId: owner, name: 'Carlos' })
    await linkPerson(db, { personId: pMaria, userId: delegate })
    await linkPerson(db, { personId: pCarlos, userId: other })
    const { sessionToken: ownerSess } = await seedSession(db, { userId: owner })
    const { sessionToken: delSess } = await seedSession(db, { userId: delegate })

    const t = (await request('/api/tasks', {
      method: 'POST', body: { title: 'X', type: 'delegate', horizon: 'core30', delegatePersonId: pMaria },
      headers: { Cookie: `comando.session=${ownerSess}` },
    })).body

    // Delegate tries to reassign: 403.
    const delAttempt = await request(`/api/tasks/${t.id}/reassign`, {
      method: 'POST', body: { delegatePersonId: pCarlos },
      headers: { Cookie: `comando.session=${delSess}` },
    })
    expect(delAttempt.status).toBe(403)
    expect(delAttempt.body.error.code).toBe('ERR_REASSIGN_FORBIDDEN')

    // Creator reassigns successfully.
    const ownerAttempt = await request(`/api/tasks/${t.id}/reassign`, {
      method: 'POST', body: { delegatePersonId: pCarlos },
      headers: { Cookie: `comando.session=${ownerSess}` },
    })
    expect(ownerAttempt.status).toBe(200)
    expect(ownerAttempt.body.delegatePersonId).toBe(pCarlos)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement list endpoint**

`server/api/tasks/index.get.ts`:

```ts
import { and, eq, desc } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks, people, users } from '~/server/db/schema'
import { taskFilter } from '~/server/utils/accessFilter'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const rows = await db.select({
    task: tasks,
    delegateName: people.name,
    delegateLinkedUserId: people.linkedUserId,
    createdByName: users.name,
  }).from(tasks)
    .leftJoin(people, eq(people.id, tasks.delegatePersonId))
    .leftJoin(users,  eq(users.id,  tasks.createdByUserId))
    .where(and(taskFilter(user.id), eq(tasks.archived, false)))
    .orderBy(desc(tasks.updatedAt))

  return {
    tasks: rows.map(r => ({
      ...r.task,
      delegatePersonName: r.delegateName,
      delegateLinkedUserId: r.delegateLinkedUserId,
      createdByName: r.createdByName,
    })),
  }
})
```

- [ ] **Step 4: Implement create endpoint** (with type logic)

`server/api/tasks/index.post.ts`:

```ts
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks, people } from '~/server/db/schema'
import { writeAudit } from '~/server/utils/audit'
import { createApiError, ErrCode } from '~/server/utils/errors'

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  horizon: z.enum(['core30', 'core60', 'core90', 'micro', 'backlog', 'hibernating']).default('core30'),
  type: z.enum(['ceo', 'delegate', 'personal']).default('ceo'),
  delegatePersonId: z.string().uuid().nullable().optional(),
  delegateName: z.string().optional(),   // for "delegate to a new name"
  projectId: z.string().uuid().nullable().optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  durationMinutes: z.number().int().min(1).optional(),
  followupActive: z.boolean().optional(),
  followupDate: z.string().optional(),
  followupHolderPersonId: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)

  let delegatePersonId: string | null = body.delegatePersonId ?? null

  if (body.type === 'delegate') {
    if (!delegatePersonId && body.delegateName) {
      const [created] = await db.insert(people).values({
        ownerUserId: user.id, name: body.delegateName,
      }).returning()
      delegatePersonId = created.id
    }
    if (!delegatePersonId) throw createApiError(ErrCode.BAD_REQUEST, 'Tarefa delegate precisa de delegatePersonId ou delegateName.')
  } else if (body.type === 'personal') {
    const [assistant] = await db.select().from(people)
      .where(and(eq(people.ownerUserId, user.id), eq(people.isAssistant, true)))
    if (!assistant) throw createApiError(ErrCode.NO_ASSISTANT, 'Configure um assistente antes de criar tarefas pessoais.')
    delegatePersonId = assistant.id
  } else {
    delegatePersonId = null
  }

  const created = await db.transaction(async (tx) => {
    const [t] = await tx.insert(tasks).values({
      ownerUserId: user.id, createdByUserId: user.id,
      delegatePersonId,
      title: body.title,
      description: body.description ?? '',
      horizon: body.horizon,
      type: body.type,
      projectId: body.projectId ?? null,
      scheduledDate: body.scheduledDate ?? null,
      scheduledTime: body.scheduledTime ?? null,
      durationMinutes: body.durationMinutes ?? null,
      followupActive: body.followupActive ?? false,
      followupDate: body.followupDate ?? null,
      followupHolderPersonId: body.followupHolderPersonId ?? null,
    }).returning()
    await writeAudit(tx, {
      entity: 'task', entityId: t.id, action: 'create',
      actorUserId: user.id, changes: { create: t },
    })
    return t
  })

  setResponseStatus(event, 201)
  return created
})
```

- [ ] **Step 5: Implement get-by-id** (scoped by access)

`server/api/tasks/[id].get.ts`:

```ts
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks } from '~/server/db/schema'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, id)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id))
  return t
})
```

- [ ] **Step 6: Implement patch** (general edit — allowed for both owner and delegate)

`server/api/tasks/[id].patch.ts`:

```ts
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks } from '~/server/db/schema'
import { auditedUpdate } from '~/server/utils/audit'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

const bodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  horizon: z.enum(['core30', 'core60', 'core90', 'micro', 'backlog', 'hibernating']).optional(),
  scheduledDate: z.string().nullable().optional(),
  scheduledTime: z.string().nullable().optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
  followupActive: z.boolean().optional(),
  followupDate: z.string().nullable().optional(),
  followupHolderPersonId: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, id)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  return db.transaction((tx) => auditedUpdate(tx, tasks, id, user.id, { ...body, updatedAt: new Date() }, { entity: 'task' }))
})
```

- [ ] **Step 7: Implement delete (hard)** — but only creator

`server/api/tasks/[id].delete.ts`:

```ts
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks } from '~/server/db/schema'
import { createApiError, ErrCode } from '~/server/utils/errors'
import { writeAudit } from '~/server/utils/audit'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb(event)
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!t) throw createApiError(ErrCode.NOT_FOUND, 'Não encontrada.')
  // Both owner and delegate can "deletar em definitivo" per spec (all actions = both).
  // Access check still required.
  const { canAccessTask } = await import('~/server/utils/accessFilter')
  if (!(await canAccessTask(db, user.id, id)))
    throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')
  return db.transaction(async (tx) => {
    await writeAudit(tx, { entity: 'task', entityId: id, action: 'delete', actorUserId: user.id, changes: { delete: t } })
    await tx.delete(tasks).where(eq(tasks.id, id))  // allowed inside audit.ts too? — this is not audit.ts
    return { ok: true }
  })
})
```

The `tx.delete(tasks)` line will fail the lint rule. Handle by extracting into `auditedDelete` in `server/utils/audit.ts`:

Append to `server/utils/audit.ts`:

```ts
export async function auditedDelete(tx: any, table: PgTable, id: string, actorUserId: string, opts: { entity: string; context?: any }) {
  const [before] = await tx.select().from(table).where(eq((table as any).id, id))
  if (!before) return
  await tx.delete(table).where(eq((table as any).id, id))
  await writeAudit(tx, {
    entity: opts.entity, entityId: id, action: 'delete',
    actorUserId, changes: { delete: before }, context: opts.context ?? null,
  })
}
```

Then use `auditedDelete(tx, tasks, id, user.id, { entity: 'task' })`.

- [ ] **Step 8: Implement complete and archive**

`server/api/tasks/[id]/complete.post.ts`:

```ts
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks } from '~/server/db/schema'
import { auditedUpdate } from '~/server/utils/audit'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, id)))
    throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')
  const body = await readBody(event).catch(() => ({})) as any
  const done = body?.done ?? true
  return db.transaction((tx) => auditedUpdate(tx, tasks, id, user.id, {
    done, completedAt: done ? new Date() : null, updatedAt: new Date(),
  }, { entity: 'task' }))
})
```

`server/api/tasks/[id]/archive.post.ts`:

```ts
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks } from '~/server/db/schema'
import { auditedUpdate } from '~/server/utils/audit'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, id)))
    throw createApiError(ErrCode.FORBIDDEN, 'Sem permissão.')
  const body = await readBody(event).catch(() => ({})) as any
  const archived = body?.archived ?? true
  return db.transaction((tx) => auditedUpdate(tx, tasks, id, user.id, { archived, updatedAt: new Date() }, { entity: 'task' }))
})
```

- [ ] **Step 9: Implement reassign** (creator-only)

`server/api/tasks/[id]/reassign.post.ts`:

```ts
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks, people } from '~/server/db/schema'
import { auditedUpdate } from '~/server/utils/audit'
import { createApiError, ErrCode } from '~/server/utils/errors'

const bodySchema = z.object({
  delegatePersonId: z.string().uuid().nullable(),
  delegateName: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)

  const [t] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!t) throw createApiError(ErrCode.NOT_FOUND, 'Não encontrada.')
  if (t.createdByUserId !== user.id)
    throw createApiError(ErrCode.REASSIGN_FORBIDDEN, 'Apenas quem criou pode reatribuir.')

  let newDelegateId: string | null = body.delegatePersonId ?? null
  if (!newDelegateId && body.delegateName) {
    const [created] = await db.insert(people).values({
      ownerUserId: user.id, name: body.delegateName,
    }).returning()
    newDelegateId = created.id
  }

  return db.transaction((tx) => auditedUpdate(tx, tasks, id, user.id, {
    delegatePersonId: newDelegateId,
    type: newDelegateId ? 'delegate' : 'ceo',
    updatedAt: new Date(),
  }, {
    entity: 'task',
    context: { from_delegate: t.delegatePersonId, to_delegate: newDelegateId },
  }))
})
```

- [ ] **Step 10: Run tests — expect PASS**

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat(tasks): CRUD with type logic, complete, archive, and reassign guard"
```

---

### Task 25: Checklist endpoints

**Files:**
- Create: `server/api/tasks/[id]/checklist/index.get.ts`
- Create: `server/api/tasks/[id]/checklist/index.post.ts`
- Create: `server/api/tasks/[id]/checklist/[cid].patch.ts`
- Create: `server/api/tasks/[id]/checklist/[cid].delete.ts`
- Create: `tests/integration/checklist.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/integration/checklist.test.ts — abbreviated outline
// - POST /api/tasks/:id/checklist adds item → 201, returns {id, position}
// - GET returns sorted list
// - PATCH toggles done
// - DELETE removes
// All require canAccessTask
```

Write full test body analogous to prior tests; 4 test cases.

- [ ] **Step 2: Implement list**

`server/api/tasks/[id]/checklist/index.get.ts`:

```ts
import { asc, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { checklistItems } from '~/server/db/schema'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')!
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, taskId)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const items = await db.select().from(checklistItems)
    .where(eq(checklistItems.taskId, taskId))
    .orderBy(asc(checklistItems.position))
  return { items }
})
```

- [ ] **Step 3: Implement create**

```ts
// server/api/tasks/[id]/checklist/index.post.ts
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { checklistItems } from '~/server/db/schema'
import { writeAudit } from '~/server/utils/audit'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

const bodySchema = z.object({ text: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')!
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, taskId)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const [last] = await db.select().from(checklistItems)
    .where(eq(checklistItems.taskId, taskId))
    .orderBy(desc(checklistItems.position)).limit(1)
  const nextPos = (last?.position ?? -1) + 1

  const created = await db.transaction(async (tx) => {
    const [i] = await tx.insert(checklistItems).values({
      taskId, text: body.text, position: nextPos,
    }).returning()
    await writeAudit(tx, {
      entity: 'checklist_item', entityId: i.id, action: 'create',
      actorUserId: user.id, changes: { create: i }, context: { taskId },
    })
    return i
  })
  setResponseStatus(event, 201)
  return created
})
```

- [ ] **Step 4: Implement patch + delete**

```ts
// server/api/tasks/[id]/checklist/[cid].patch.ts
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { checklistItems } from '~/server/db/schema'
import { auditedUpdate } from '~/server/utils/audit'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

const bodySchema = z.object({
  text: z.string().min(1).optional(),
  done: z.boolean().optional(),
  position: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')!
  const cid = getRouterParam(event, 'cid')!
  const body = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, taskId)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')

  const [existing] = await db.select().from(checklistItems)
    .where(and(eq(checklistItems.id, cid), eq(checklistItems.taskId, taskId)))
  if (!existing) throw createApiError(ErrCode.NOT_FOUND, 'Item não encontrado.')

  const patch: any = { ...body, updatedAt: new Date() }
  if (body.done === true && !existing.done) patch.doneAt = new Date()
  if (body.done === false) patch.doneAt = null

  return db.transaction((tx) => auditedUpdate(tx, checklistItems, cid, user.id, patch, {
    entity: 'checklist_item', context: { taskId },
  }))
})
```

```ts
// server/api/tasks/[id]/checklist/[cid].delete.ts
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { checklistItems } from '~/server/db/schema'
import { auditedDelete } from '~/server/utils/audit'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')!
  const cid = getRouterParam(event, 'cid')!
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, taskId)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const [existing] = await db.select().from(checklistItems)
    .where(and(eq(checklistItems.id, cid), eq(checklistItems.taskId, taskId)))
  if (!existing) throw createApiError(ErrCode.NOT_FOUND, 'Item não encontrado.')
  return db.transaction((tx) => auditedDelete(tx, checklistItems, cid, user.id, { entity: 'checklist_item', context: { taskId } })).then(() => ({ ok: true }))
})
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(tasks): checklist items CRUD with audit"
```

---

### Task 26: Annotations endpoints

**Files:**
- Create: `server/api/tasks/[id]/annotations/index.get.ts`
- Create: `server/api/tasks/[id]/annotations/index.post.ts`
- Create: `server/api/tasks/[id]/annotations/[aid].delete.ts`
- Create: `tests/integration/annotations.test.ts`

- [ ] **Step 1: Write failing test** — 3 cases: create, list (ordered), delete-by-author-only.

- [ ] **Step 2: Implement list**

```ts
// server/api/tasks/[id]/annotations/index.get.ts
import { asc, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { taskAnnotations, users } from '~/server/db/schema'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')!
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, taskId)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const rows = await db.select({ a: taskAnnotations, authorName: users.name })
    .from(taskAnnotations)
    .leftJoin(users, eq(users.id, taskAnnotations.authorUserId))
    .where(eq(taskAnnotations.taskId, taskId))
    .orderBy(asc(taskAnnotations.createdAt))
  return { annotations: rows.map(r => ({ ...r.a, authorName: r.authorName })) }
})
```

- [ ] **Step 3: Implement create**

```ts
// server/api/tasks/[id]/annotations/index.post.ts
import { z } from 'zod'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { taskAnnotations } from '~/server/db/schema'
import { writeAudit } from '~/server/utils/audit'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

const bodySchema = z.object({ body: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')!
  const input = bodySchema.parse(await readBody(event))
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, taskId)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const created = await db.transaction(async (tx) => {
    const [a] = await tx.insert(taskAnnotations).values({
      taskId, authorUserId: user.id, body: input.body,
    }).returning()
    await writeAudit(tx, {
      entity: 'task_annotation', entityId: a.id, action: 'create',
      actorUserId: user.id, changes: { create: a }, context: { taskId },
    })
    return a
  })
  setResponseStatus(event, 201)
  return created
})
```

- [ ] **Step 4: Implement delete** (only the author or creator of task can delete)

```ts
// server/api/tasks/[id]/annotations/[aid].delete.ts
import { and, eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { taskAnnotations, tasks } from '~/server/db/schema'
import { auditedDelete } from '~/server/utils/audit'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const taskId = getRouterParam(event, 'id')!
  const aid = getRouterParam(event, 'aid')!
  const db = useDb(event)

  const [a] = await db.select().from(taskAnnotations)
    .where(and(eq(taskAnnotations.id, aid), eq(taskAnnotations.taskId, taskId)))
  if (!a) throw createApiError(ErrCode.NOT_FOUND, 'Anotação não encontrada.')
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId))
  if (a.authorUserId !== user.id && t.createdByUserId !== user.id)
    throw createApiError(ErrCode.FORBIDDEN, 'Só o autor ou o criador da tarefa pode remover.')
  return db.transaction((tx) => auditedDelete(tx, taskAnnotations, aid, user.id, { entity: 'task_annotation', context: { taskId } }))
    .then(() => ({ ok: true }))
})
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(tasks): annotations CRUD with authorship check"
```

---

### Task 27: Reschedules derived endpoint

**Files:**
- Create: `server/api/tasks/[id]/reschedules.get.ts`
- Create: `tests/integration/reschedules.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// Create a task with scheduledDate=2026-05-01, PATCH to 2026-05-08, PATCH to 2026-05-15.
// GET /api/tasks/:id/reschedules returns [{from:'2026-05-01', to:'2026-05-08', at}, {from:'2026-05-08', to:'2026-05-15', at}].
```

- [ ] **Step 2: Implement**

```ts
// server/api/tasks/[id]/reschedules.get.ts
import { and, eq, asc, sql } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { auditLog } from '~/server/db/schema'
import { canAccessTask } from '~/server/utils/accessFilter'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb(event)
  if (!(await canAccessTask(db, user.id, id)))
    throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const rows = await db.select().from(auditLog)
    .where(and(
      eq(auditLog.entityType, 'task'),
      eq(auditLog.entityId, id),
      sql`${auditLog.changes} ? 'scheduledDate'`,
    ))
    .orderBy(asc(auditLog.at))
  const reschedules = rows.map(r => ({
    from: (r.changes as any).scheduledDate.from,
    to: (r.changes as any).scheduledDate.to,
    at: r.at,
    actorUserId: r.actorUserId,
  }))
  return { reschedules }
})
```

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(tasks): reschedules derived from audit_log"
```

---

## Milestone H — Agenda (Task 28)

### Task 28: Agenda endpoint (3-day window + follow-up derivation)

**Files:**
- Create: `server/api/agenda/index.get.ts`
- Create: `tests/integration/agenda.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// Seed 4 tasks: two with scheduledDate inside the window, one followupActive with followupDate inside, one outside.
// GET /api/agenda?from=...&to=... returns 3 entries, correct isFollowup flags.
```

- [ ] **Step 2: Implement**

```ts
// server/api/agenda/index.get.ts
import { z } from 'zod'
import { and, eq, gte, lte, or } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { tasks, people } from '~/server/db/schema'
import { taskFilter } from '~/server/utils/accessFilter'

const querySchema = z.object({ from: z.string(), to: z.string() })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const q = querySchema.parse(getQuery(event))
  const db = useDb(event)

  const rows = await db.select({ t: tasks, personName: people.name })
    .from(tasks).leftJoin(people, eq(people.id, tasks.delegatePersonId))
    .where(and(
      taskFilter(user.id),
      eq(tasks.archived, false),
      or(
        and(gte(tasks.scheduledDate, q.from), lte(tasks.scheduledDate, q.to)),
        and(eq(tasks.followupActive, true), gte(tasks.followupDate, q.from), lte(tasks.followupDate, q.to)),
      ),
    ))

  return {
    events: rows.flatMap(r => {
      const out: any[] = []
      if (r.t.scheduledDate && r.t.scheduledDate >= q.from && r.t.scheduledDate <= q.to) {
        out.push({ kind: 'scheduled', task: r.t, date: r.t.scheduledDate, time: r.t.scheduledTime, duration: r.t.durationMinutes })
      }
      if (r.t.followupActive && r.t.followupDate && r.t.followupDate >= q.from && r.t.followupDate <= q.to) {
        out.push({ kind: 'followup', task: r.t, date: r.t.followupDate })
      }
      return out
    }),
  }
})
```

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(agenda): window endpoint combining scheduled and followup"
```

---

## Milestone I — UI portada do protótipo (Tasks 29–32)

### Task 29: Layout, topbar, tabs, auth middleware

**Files:**
- Create: `app/layouts/default.vue`
- Create: `app/components/topbar/Topbar.vue`
- Create: `app/components/topbar/Kpis.vue`
- Create: `app/components/topbar/BuscaGlobal.vue`
- Create: `app/middleware/auth.global.ts`
- Create: `app/utils/dates.ts` (porta `fmtBRDate`, `addDays`, etc. do protótipo)
- Create: `app/utils/horizontes.ts` (porta lista `HORIZONTES`)
- Create: `app/composables/useAuth.ts` (já criado em Task 9 — modifica para expor `user` populado via `useFetch('/api/auth/me')`)

- [ ] **Step 1: Create global auth middleware**

`app/middleware/auth.global.ts`:

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  const publicPaths = ['/login', '/onboarding/passkey', '/login/waiting', '/invite']
  const isPublic = publicPaths.some(p => to.path === p || to.path.startsWith(p + '/'))
  if (isPublic) return
  try {
    const user = await $fetch('/api/auth/me')
    useState('auth:user').value = user
  } catch {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }
})
```

- [ ] **Step 2: Create `/api/auth/me.get.ts`**

```ts
import { requireAuthedUser } from '~/server/utils/auth'
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  return { id: user.id, email: user.email, name: user.name, role: user.role }
})
```

- [ ] **Step 3: Port `app/utils/dates.ts`** from the prototype (copy `fmtDate`, `sameDay`, `addDays`, `addMonths`, `fmtBRDate`, `fmtNowStamp`, `DOW`, `DOW_FULL`, `DOW_SHORT`, `MESES` verbatim as ES module exports)

```ts
export const DOW = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
export const DOW_FULL = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
export const DOW_SHORT = ['D','S','T','Q','Q','S','S']
export const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

export function fmtDate(d: Date | string): string {
  if (typeof d === 'string') d = new Date(d + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
export function sameDay(a: Date | string, b: Date | string) { return fmtDate(a) === fmtDate(b) }
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x }
export function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth()+n); return x }
export function fmtBRDate(d: Date | string): string {
  if (typeof d === 'string') d = new Date(d + 'T12:00:00')
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}
export function fmtNowStamp(): string {
  const d = new Date()
  return `${fmtBRDate(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
```

- [ ] **Step 4: Port `app/utils/horizontes.ts`**

```ts
export const HORIZONTES = [
  { id: 'core30', label: 'Core 30 dias', desc: 'Próximas 4 semanas' },
  { id: 'core60', label: 'Core 60 dias', desc: '2 meses' },
  { id: 'core90', label: 'Core 90 dias', desc: '3 meses' },
  { id: 'micro',  label: 'Micro', desc: 'Até 30 min · batelada' },
  { id: 'backlog', label: 'Backlog', desc: 'Depois do trimestre' },
  { id: 'hibernando', label: 'Hibernando', desc: 'Sem operador' },
] as const
```

Note: backend uses `hibernating`; UI constant uses id `hibernando`. Map between them explicitly in `app/utils/horizontes.ts`:

```ts
export const horizonUIToDb = { core30: 'core30', core60: 'core60', core90: 'core90', micro: 'micro', backlog: 'backlog', hibernando: 'hibernating' } as const
export const horizonDbToUI = Object.fromEntries(Object.entries(horizonUIToDb).map(([k,v]) => [v,k])) as Record<string,string>
```

- [ ] **Step 5: Create topbar components**

`app/components/topbar/Topbar.vue`:

```vue
<script setup lang="ts">
import { DOW, MESES } from '~/utils/dates'
const now = ref(new Date())
const dateLabel = computed(() => {
  const d = now.value
  return `${DOW[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} · ${d.getFullYear()}`
})
let t: any
onMounted(() => { t = setInterval(() => now.value = new Date(), 60_000) })
onUnmounted(() => clearInterval(t))
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="titulo">Comando</div>
      <div class="sub">{{ dateLabel }}</div>
    </div>
    <Kpis />
    <BuscaGlobal />
    <div class="actions">
      <UButton variant="ghost" size="xs" @click="$emit('export')">Exportar</UButton>
      <UButton size="xs" @click="$emit('nova-tarefa')">+ Tarefa</UButton>
    </div>
  </header>
</template>

<style scoped>
.topbar { background: rgba(255,255,255,.85); backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); padding: 10px 20px; display: flex; align-items: center; gap: 14px; z-index: 10; }
.brand { display: flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
.brand .titulo { font-size: 15px; font-weight: 600; letter-spacing: -.015em; }
.brand .sub { font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.actions { margin-left: auto; display: flex; gap: 6px; flex-shrink: 0; }
</style>
```

`app/components/topbar/Kpis.vue`:

```vue
<script setup lang="ts">
const { data } = await useFetch('/api/tasks', { default: () => ({ tasks: [] }) })
const ativas = computed(() => (data.value?.tasks ?? []).filter((t: any) => !t.done && !t.archived))
const ceo = computed(() => ativas.value.filter((t: any) => t.type === 'ceo'))
const delego = computed(() => ativas.value.filter((t: any) => t.type === 'delegate'))
const core30 = computed(() => ativas.value.filter((t: any) => t.horizon === 'core30'))
const followup = computed(() => ativas.value.filter((t: any) => t.followupActive))
</script>

<template>
  <div class="kpis">
    <div class="kpi"><div class="k-val">{{ ativas.length }}</div><div class="k-lab">Ativas</div></div>
    <div class="kpi ceo"><div class="k-val">{{ ceo.length }}</div><div class="k-lab">CEO</div></div>
    <div class="kpi delego"><div class="k-val">{{ delego.length }}</div><div class="k-lab">Delego</div></div>
    <div class="kpi"><div class="k-val">{{ core30.length }}</div><div class="k-lab">Core 30</div></div>
    <div class="kpi followup"><div class="k-val">{{ followup.length }}</div><div class="k-lab">Follow-up</div></div>
  </div>
</template>

<style scoped>
.kpis { display: flex; gap: 8px; flex-shrink: 0; }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 5px 11px; display: flex; flex-direction: column; }
.kpi .k-val { font-size: 15px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.kpi .k-lab { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: .05em; font-weight: 500; }
.kpi.ceo .k-val { color: var(--ceo-fg); }
.kpi.delego .k-val { color: var(--delego-fg); }
.kpi.followup .k-val { color: var(--followup-fg); }
</style>
```

`app/components/topbar/BuscaGlobal.vue`:

```vue
<script setup lang="ts">
const q = defineModel<string>('q', { default: '' })
</script>
<template>
  <div class="search">
    <UInput v-model="q" placeholder="Buscar tudo…" size="sm" class="max-w-sm" />
  </div>
</template>
<style scoped>
.search { flex: 1; max-width: 340px; }
</style>
```

- [ ] **Step 6: Create default layout**

`app/layouts/default.vue`:

```vue
<script setup lang="ts">
const tabs = [
  { view: 'trabalho', label: 'Trabalho' },
  { view: 'agenda', label: 'Agenda' },
  { view: 'pagamentos', label: 'Pagamentos (em breve)' },
  { view: 'projetos', label: 'Projetos (em breve)' },
  { view: 'notas', label: 'Notas (em breve)' },
  { view: 'arquivo', label: 'Arquivo (em breve)' },
]
const route = useRoute()
const current = computed(() => route.path.split('/')[1] || 'trabalho')
</script>

<template>
  <div class="app">
    <Topbar @nova-tarefa="$emit('nova-tarefa')" />
    <AuthDeviceApprovalBanner />
    <nav class="tabs-main">
      <NuxtLink v-for="t in tabs" :key="t.view" :to="`/${t.view}`"
        class="tab-main" :class="{ active: current === t.view }">
        {{ t.label }}
      </NuxtLink>
    </nav>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app { display: grid; grid-template-rows: auto auto auto 1fr; height: 100vh; }
.tabs-main { background: rgba(255,255,255,.85); border-bottom: 1px solid var(--border); padding: 0 20px; display: flex; gap: 0; z-index: 9; overflow-x: auto; }
.tab-main { padding: 10px 18px; font-size: 13px; font-weight: 500; color: var(--text-2); border-bottom: 2px solid transparent; transition: all .15s; white-space: nowrap; text-decoration: none; }
.tab-main.active { color: var(--accent); border-bottom-color: var(--accent); }
.main { background: var(--border); overflow: hidden; }
</style>
```

- [ ] **Step 7: Create page stubs for "em breve" views**

`app/pages/pagamentos.vue`, `app/pages/projetos.vue`, `app/pages/notas.vue`, `app/pages/arquivo.vue` — each contains:

```vue
<template>
  <UContainer class="py-12 text-center text-gray-500">
    <p>Em breve — disponível na Fase 2.</p>
  </UContainer>
</template>
```

- [ ] **Step 8: Redirect root to /trabalho**

`app/pages/index.vue`:

```vue
<script setup lang="ts">
await navigateTo('/trabalho', { replace: true })
</script>
<template />
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat(ui): layout, topbar, tabs, auth middleware"
```

---

### Task 30: Trabalho view — horizontes + inbox + task card + drag/drop

**Files:**
- Create: `app/pages/trabalho.vue`
- Create: `app/components/tarefas/HorizonteList.vue`
- Create: `app/components/tarefas/TaskCard.vue`
- Create: `app/components/tarefas/InboxQuick.vue`
- Create: `app/composables/useTasks.ts`

- [ ] **Step 1: Install TanStack Vue Query**

```bash
pnpm add @tanstack/vue-query
```

Register plugin:

```ts
// app/plugins/vue-query.ts
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
export default defineNuxtPlugin(nuxt => {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, refetchInterval: 45_000 },
    },
  })
  nuxt.vueApp.use(VueQueryPlugin, { queryClient: qc })
})
```

- [ ] **Step 2: Create `useTasks` composable**

```ts
// app/composables/useTasks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'

export function useTasks() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['tasks'],
    queryFn: () => $fetch('/api/tasks').then((r: any) => r.tasks),
  })

  const create = useMutation({
    mutationFn: (body: any) => $fetch('/api/tasks', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) =>
      $fetch(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['audit', 'task', vars.id] })
    },
  })

  const complete = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      $fetch(`/api/tasks/${id}/complete`, { method: 'POST', body: { done } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const archive = useMutation({
    mutationFn: (id: string) => $fetch(`/api/tasks/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const moveHorizon = useMutation({
    mutationFn: ({ id, horizon }: { id: string; horizon: string }) =>
      $fetch(`/api/tasks/${id}`, { method: 'PATCH', body: { horizon } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  return { list, create, update, complete, archive, moveHorizon }
}
```

- [ ] **Step 3: Implement `trabalho.vue`**

```vue
<script setup lang="ts">
import { HORIZONTES, horizonUIToDb, horizonDbToUI } from '~/utils/horizontes'
const { list, moveHorizon, create } = useTasks()

const tasksByHorizon = computed(() => {
  const by: Record<string, any[]> = {}
  HORIZONTES.forEach(h => { by[h.id] = [] })
  for (const t of list.data.value ?? []) {
    const ui = horizonDbToUI[t.horizon] ?? t.horizon
    ;(by[ui] ??= []).push(t)
  }
  // sort: undone first, then by date, then by createdAt
  Object.values(by).forEach(arr => arr.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return (a.scheduledDate ?? '9999').localeCompare(b.scheduledDate ?? '9999')
  }))
  return by
})

function onDrop(taskId: string, toHorizonUi: string) {
  moveHorizon.mutate({ id: taskId, horizon: (horizonUIToDb as any)[toHorizonUi] })
}

async function onInbox(title: string) {
  await create.mutateAsync({ title, type: 'ceo', horizon: 'core30' })
}
</script>

<template>
  <div class="trabalho-grid">
    <section class="panel">
      <div class="panel-head"><h2>Tarefas</h2><div class="sub">Arraste entre horizontes</div></div>
      <div class="panel-body">
        <TarefasInboxQuick @submit="onInbox" />
        <TarefasHorizonteList
          v-for="h in HORIZONTES"
          :key="h.id"
          :horizonte="h"
          :tasks="tasksByHorizon[h.id]"
          @drop-task="taskId => onDrop(taskId, h.id)"
        />
      </div>
    </section>
    <!-- Painéis de Agenda/Pagamentos/Notas são renderizados separadamente ou omitidos em Phase 1. -->
    <section class="panel"><AgendaPanel compact /></section>
  </div>
</template>

<style scoped>
.trabalho-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1px; background: var(--border); height: 100%; }
.panel { background: var(--bg); overflow-y: auto; }
.panel-head { position: sticky; top: 0; background: rgba(245,245,247,.92); padding: 12px 16px 10px; border-bottom: 1px solid var(--border); z-index: 5; }
.panel-head h2 { font-size: 13px; font-weight: 600; }
.panel-head .sub { font-size: 11px; color: var(--text-3); margin-top: 1px; }
.panel-body { padding: 12px 16px 40px; }
</style>
```

- [ ] **Step 4: Implement `HorizonteList.vue`** (with drag/drop)

```vue
<script setup lang="ts">
const props = defineProps<{ horizonte: { id: string; label: string; desc: string }; tasks: any[] }>()
const emit = defineEmits<{ 'drop-task': [string] }>()
const dropHover = ref(false)

function onDragOver(e: DragEvent) { e.preventDefault(); dropHover.value = true }
function onDragLeave() { dropHover.value = false }
function onDrop(e: DragEvent) {
  e.preventDefault(); dropHover.value = false
  const id = e.dataTransfer?.getData('text/plain')
  if (id) emit('drop-task', id)
}
</script>

<template>
  <div class="horizonte" :class="{ 'drop-hover': dropHover }"
       :data-h="horizonte.id"
       @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <div class="horizonte-head">
      <div class="label">{{ horizonte.label }} <span class="count">{{ tasks.filter(t => !t.done).length }}</span></div>
      <div class="desc">{{ horizonte.desc }}</div>
    </div>
    <div class="horizonte-body" :class="{ empty: tasks.length === 0 }">
      <TarefasTaskCard v-for="t in tasks" :key="t.id" :task="t" />
    </div>
  </div>
</template>

<style scoped>
/* port selectively from prototype .horizonte, .horizonte-head, etc. */
.horizonte { margin-bottom: 18px; background: var(--surface); border-radius: var(--radius-lg); border: 1px solid var(--border); overflow: hidden; }
.horizonte.drop-hover { box-shadow: 0 0 0 2px var(--accent); }
.horizonte-head { padding: 10px 14px; background: var(--surface-alt); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.horizonte-head .label { font-size: 13px; font-weight: 600; }
.horizonte-head .count { font-size: 11px; color: var(--text-3); background: var(--surface); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border); margin-left: 10px; }
.horizonte-head .desc { font-size: 11px; color: var(--text-3); }
.horizonte-body { min-height: 30px; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.horizonte-body.empty::before { content: 'Vazio. Arraste tarefas aqui.'; display: block; text-align: center; color: var(--text-4); font-size: 12px; padding: 12px; font-style: italic; }
</style>
```

- [ ] **Step 5: Implement `TaskCard.vue`**

Port the prototype's `.task` markup and class logic — but as Vue SFC. Emits `click` to open modal (Task 31). The full markup mirrors prototype's `renderTaskCard` function. Fields to show: check toggle, title, badges (tipo, delegado, projeto, agenda, followup, progress), expand chevron.

```vue
<script setup lang="ts">
import { fmtBRDate } from '~/utils/dates'
const props = defineProps<{ task: any }>()
const { complete } = useTasks()

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.task.id)
}

function onToggle(e: Event) {
  e.stopPropagation()
  complete.mutate({ id: props.task.id, done: !props.task.done })
}

const tipoClass = computed(() => ({
  ceo: 'ceo', delegate: 'delego', personal: 'pessoal',
})[props.task.type as 'ceo'|'delegate'|'personal'] ?? '')
</script>

<template>
  <div class="task" :class="{ done: task.done }" draggable="true" @dragstart="onDragStart" @click="$emit('open', task)">
    <div class="task-main">
      <div class="check" @click="onToggle"></div>
      <div class="task-titulo">{{ task.title }}</div>
      <div class="task-badges">
        <span v-if="task.followupActive && task.followupDate"
              class="badge-followup">
          {{ fmtBRDate(task.followupDate) }}
        </span>
        <span v-else-if="task.scheduledDate" class="badge-agenda">
          {{ fmtBRDate(task.scheduledDate) }}{{ task.scheduledTime ? ` · ${task.scheduledTime}` : '' }}
        </span>
        <span v-if="task.type === 'delegate' && task.delegatePersonName" class="badge-delegado">{{ task.delegatePersonName }}</span>
        <span class="badge-tipo" :class="tipoClass">{{ { ceo: 'CEO', delegate: 'Delego', personal: 'Pessoal' }[task.type] }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* port .task, .task-main, .check, .task-titulo, .badge-*, .done styles from prototype */
.task { background: var(--surface); padding: 10px 12px; border-radius: var(--radius-sm); cursor: grab; border: 1px solid transparent; transition: background .12s; }
.task:hover { background: var(--surface-hover); border-color: var(--border); }
.task.done .task-titulo { text-decoration: line-through; color: var(--text-3); }
.task-main { display: flex; align-items: center; gap: 10px; }
.check { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--border-strong); flex-shrink: 0; cursor: pointer; }
.task.done .check { background: var(--success); border-color: var(--success); }
.task-titulo { flex: 1; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-badges { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; justify-content: flex-end; max-width: 55%; }
.badge-tipo { font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; text-transform: uppercase; }
.badge-tipo.ceo { background: var(--ceo-bg); color: var(--ceo-fg); }
.badge-tipo.delego { background: var(--delego-bg); color: var(--delego-fg); }
.badge-tipo.pessoal { background: var(--pessoal-bg); color: var(--pessoal-fg); }
.badge-delegado { font-size: 10px; background: var(--delego-bg); color: var(--delego-fg); padding: 2px 7px; border-radius: 10px; }
.badge-delegado::before { content: '→ '; opacity: .7; }
.badge-agenda { font-size: 10px; color: var(--accent); background: var(--accent-soft); padding: 2px 7px; border-radius: 10px; font-weight: 600; }
.badge-followup { font-size: 10px; background: var(--followup-bg); color: var(--followup-fg); padding: 2px 7px; border-radius: 10px; font-weight: 600; }
.badge-followup::before { content: '⏳ '; }
</style>
```

- [ ] **Step 6: Implement `InboxQuick.vue`**

```vue
<script setup lang="ts">
const emit = defineEmits<{ submit: [string] }>()
const val = ref('')
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && val.value.trim()) { emit('submit', val.value.trim()); val.value = '' }
}
</script>
<template>
  <div class="inbox">
    <div class="inbox-head">Inbox · captura rápida</div>
    <UInput v-model="val" placeholder="O que precisa fazer? (Enter)" @keydown="onKey" />
  </div>
</template>
<style scoped>
.inbox { margin-bottom: 18px; background: var(--surface); border-radius: var(--radius-lg); border: 1px solid var(--border); padding: 10px 12px; }
.inbox-head { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
</style>
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(ui): trabalho view with horizons, inbox, task cards, drag/drop"
```

---

### Task 31: Task modal — create/edit + checklist + annotations + history

**Files:**
- Create: `app/components/tarefas/TaskModal.vue`
- Create: `app/components/tarefas/Checklist.vue`
- Create: `app/components/tarefas/Anotacoes.vue`
- Create: `app/components/tarefas/HistoricoTimeline.vue`
- Create: `app/composables/useAudit.ts`

- [ ] **Step 1: Create `useAudit` composable**

```ts
// app/composables/useAudit.ts
import { useQuery } from '@tanstack/vue-query'

export function useAudit(entity: string, id: Ref<string | null>) {
  return useQuery({
    queryKey: computed(() => ['audit', entity, id.value]) as any,
    queryFn: () => id.value ? $fetch('/api/audit', { query: { entity, id: id.value } }).then((r: any) => r.entries) : [],
    enabled: computed(() => !!id.value) as any,
  })
}
```

- [ ] **Step 2: Create `TaskModal.vue`** — with tabs "Detalhes", "Checklist", "Anotações", "Histórico"

```vue
<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; task?: any }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const { create, update } = useTasks()
const active = ref<'detalhes'|'checklist'|'anotacoes'|'historico'>('detalhes')

const form = reactive({
  title: '', description: '',
  horizon: 'core30' as 'core30'|'core60'|'core90'|'micro'|'backlog'|'hibernating',
  type: 'ceo' as 'ceo'|'delegate'|'personal',
  delegatePersonId: null as string | null,
  delegateName: '',
  scheduledDate: '' as string | '', scheduledTime: '' as string | '',
  durationMinutes: null as number | null,
  followupActive: false, followupDate: '' as string | '',
  followupHolderPersonId: null as string | null,
})

watchEffect(() => {
  if (props.task) Object.assign(form, { ...form, ...props.task })
})

async function onSave() {
  const patch: any = { ...form }
  if (props.task?.id) await update.mutateAsync({ id: props.task.id, patch })
  else await create.mutateAsync(patch)
  emit('update:modelValue', false)
}
</script>

<template>
  <UModal v-model:open="props.modelValue">
    <div class="p-4 space-y-4">
      <div class="flex gap-4 border-b">
        <button v-for="tab in ['detalhes','checklist','anotacoes','historico']"
                :key="tab"
                class="px-3 py-2 text-sm"
                :class="{ 'border-b-2 border-accent text-accent': active === tab }"
                @click="active = tab as any">
          {{ { detalhes: 'Detalhes', checklist: 'Checklist', anotacoes: 'Anotações', historico: 'Histórico' }[tab] }}
        </button>
      </div>

      <div v-if="active === 'detalhes'" class="space-y-3">
        <UInput v-model="form.title" placeholder="Título" />
        <UTextarea v-model="form.description" placeholder="Descrição" rows="4" />
        <div class="grid grid-cols-3 gap-3">
          <USelect v-model="form.horizon" :options="[
            {value:'core30',label:'Core 30'},{value:'core60',label:'Core 60'},{value:'core90',label:'Core 90'},
            {value:'micro',label:'Micro'},{value:'backlog',label:'Backlog'},{value:'hibernating',label:'Hibernando'},
          ]" />
          <USelect v-model="form.type" :options="[
            {value:'ceo',label:'CEO'},{value:'delegate',label:'Delego'},{value:'personal',label:'Pessoal'},
          ]" />
          <!-- Project select is Phase 2 — disabled for now. -->
        </div>
        <DelegacaoPessoaAutocomplete v-if="form.type === 'delegate'" v-model="form.delegatePersonId" v-model:name="form.delegateName" />
        <div class="grid grid-cols-3 gap-3">
          <UInput v-model="form.scheduledDate" type="date" />
          <UInput v-model="form.scheduledTime" type="time" />
          <UInput v-model.number="form.durationMinutes" type="number" min="15" step="15" placeholder="Duração" />
        </div>
        <div class="border border-amber-200 bg-amber-50 rounded p-3">
          <label class="flex items-center gap-2 text-sm">
            <UToggle v-model="form.followupActive" />
            <span>Follow-up</span>
          </label>
          <div v-if="form.followupActive" class="grid grid-cols-2 gap-3 mt-2">
            <UInput v-model="form.followupDate" type="date" />
            <!-- holder person select — simple for MVP -->
          </div>
        </div>
      </div>

      <TarefasChecklist v-else-if="active === 'checklist' && task?.id" :task-id="task.id" />
      <TarefasAnotacoes v-else-if="active === 'anotacoes' && task?.id" :task-id="task.id" />
      <TarefasHistoricoTimeline v-else-if="active === 'historico' && task?.id" :task-id="task.id" />

      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('update:modelValue', false)">Cancelar</UButton>
        <UButton @click="onSave">Salvar</UButton>
      </div>
    </div>
  </UModal>
</template>
```

- [ ] **Step 3: Implement `Checklist.vue`**

```vue
<script setup lang="ts">
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
const props = defineProps<{ taskId: string }>()
const qc = useQueryClient()
const key = computed(() => ['checklist', props.taskId])

const list = useQuery({
  queryKey: key as any,
  queryFn: () => $fetch(`/api/tasks/${props.taskId}/checklist`).then((r: any) => r.items),
})

const add = useMutation({
  mutationFn: (text: string) => $fetch(`/api/tasks/${props.taskId}/checklist`, { method: 'POST', body: { text } }),
  onSuccess: () => qc.invalidateQueries({ queryKey: key.value }),
})
const toggle = useMutation({
  mutationFn: ({ cid, done }: { cid: string; done: boolean }) =>
    $fetch(`/api/tasks/${props.taskId}/checklist/${cid}`, { method: 'PATCH', body: { done } }),
  onSuccess: () => qc.invalidateQueries({ queryKey: key.value }),
})
const del = useMutation({
  mutationFn: (cid: string) => $fetch(`/api/tasks/${props.taskId}/checklist/${cid}`, { method: 'DELETE' }),
  onSuccess: () => qc.invalidateQueries({ queryKey: key.value }),
})

const newText = ref('')
function onAdd() { if (newText.value.trim()) { add.mutate(newText.value.trim()); newText.value = '' } }
</script>

<template>
  <div class="space-y-2">
    <div v-for="i in list.data.value ?? []" :key="i.id" class="flex items-center gap-2">
      <UCheckbox :model-value="i.done" @update:model-value="v => toggle.mutate({ cid: i.id, done: v })" />
      <span :class="{ 'line-through text-gray-400': i.done }">{{ i.text }}</span>
      <UButton size="xs" variant="ghost" color="red" @click="del.mutate(i.id)">✕</UButton>
    </div>
    <div class="flex gap-2">
      <UInput v-model="newText" placeholder="Adicionar item…" @keydown.enter="onAdd" class="flex-1" />
      <UButton size="sm" @click="onAdd">+</UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Implement `Anotacoes.vue`** — analogous structure (GET/POST/DELETE on `/annotations`)

- [ ] **Step 5: Implement `HistoricoTimeline.vue`**

```vue
<script setup lang="ts">
const props = defineProps<{ taskId: string }>()
const id = computed(() => props.taskId)
const { data, isLoading } = useAudit('task', id)

const grouped = computed(() => {
  const out: any[] = []
  const byHour: Record<string, any[]> = {}
  for (const e of data.value ?? []) {
    const key = `${e.actorUserId}:${new Date(e.at).toISOString().slice(0, 13)}`
    if (!byHour[key]) { byHour[key] = []; out.push({ key, head: e, items: byHour[key] }) }
    byHour[key].push(e)
  }
  return out
})

function summarize(group: { items: any[] }) {
  // Render a short human-readable summary per group based on entity_type/action/changes.
  return group.items.map(e => {
    if (e.entityType === 'task' && e.action === 'create') return 'criou a tarefa'
    if (e.entityType === 'task' && e.action === 'reassign') return `reatribuiu para ${e.changes?.delegatePersonId?.to ?? 'ninguém'}`
    if (e.entityType === 'task' && e.action === 'complete') return 'concluiu a tarefa'
    if (e.entityType === 'task' && e.action === 'update' && e.changes?.scheduledDate)
      return `reagendou de ${e.changes.scheduledDate.from ?? 'sem data'} para ${e.changes.scheduledDate.to ?? 'sem data'}`
    if (e.entityType === 'checklist_item' && e.action === 'create') return 'adicionou item ao checklist'
    if (e.entityType === 'checklist_item' && e.action === 'complete') return 'marcou item do checklist'
    if (e.entityType === 'task_annotation' && e.action === 'create') return 'adicionou anotação'
    return e.action
  }).join(', ')
}
</script>

<template>
  <div class="space-y-2 text-sm">
    <p v-if="isLoading">Carregando…</p>
    <div v-for="g in grouped" :key="g.key" class="flex gap-3 border-l-2 border-accent pl-3">
      <div>
        <div class="font-medium">{{ new Date(g.head.at).toLocaleString('pt-BR') }}</div>
        <div class="text-gray-600">{{ summarize(g) }}</div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Wire modal from TaskCard and topbar "+ Tarefa"**

In `trabalho.vue`:

```vue
<script setup lang="ts">
const modalOpen = ref(false)
const editing = ref<any | null>(null)
function openNew() { editing.value = null; modalOpen.value = true }
function openEdit(task: any) { editing.value = task; modalOpen.value = true }
</script>

<template>
  <!-- ... -->
  <TarefasTaskModal v-model="modalOpen" :task="editing" />
</template>
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(ui): task modal with checklist, annotations, history timeline"
```

---

### Task 32: Agenda view — mini calendar + 3-day grid

**Files:**
- Create: `app/pages/agenda.vue`
- Create: `app/components/agenda/MiniCalendar.vue`
- Create: `app/components/agenda/AgendaGrid.vue`
- Create: `app/composables/useAgenda.ts`

- [ ] **Step 1: Create `useAgenda` composable**

```ts
// app/composables/useAgenda.ts
import { useQuery } from '@tanstack/vue-query'
import { addDays, fmtDate } from '~/utils/dates'

export function useAgenda() {
  const offset3d = useState<number>('agenda:offset', () => 0)
  const range = computed(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const start = addDays(today, offset3d.value * 3)
    const end = addDays(start, 2)
    return { from: fmtDate(start), to: fmtDate(end), start, end }
  })
  const events = useQuery({
    queryKey: computed(() => ['agenda', range.value.from, range.value.to]) as any,
    queryFn: () => $fetch('/api/agenda', { query: { from: range.value.from, to: range.value.to } }).then((r: any) => r.events),
    staleTime: 10_000, refetchInterval: 45_000, refetchOnWindowFocus: true,
  })
  return { offset3d, range, events }
}
```

- [ ] **Step 2: Implement `MiniCalendar.vue`** — port the prototype's `renderMiniCalendar` semantically

Full port of the prototype's minicalendar logic (month grid, today highlight, window highlight). Use `fmtDate`, `addDays`, `addMonths`, `MESES`, `DOW_SHORT` from `app/utils/dates`.

- [ ] **Step 3: Implement `AgendaGrid.vue`** — 3-day hour grid

Port the prototype's `renderAgendaGrid` — 44px left column of hours, 3 day columns with `ag-hour-slot` each; events as absolutely-positioned blocks keyed by `top = (hh*60+mm)/60*48`; all-day row at top.

- [ ] **Step 4: Implement `agenda.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { offset3d, range, events } = useAgenda()
</script>

<template>
  <UContainer class="py-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Agenda</h1>
      <div class="flex gap-2">
        <UButton size="xs" variant="ghost" @click="offset3d--">‹ anterior</UButton>
        <UButton size="xs" variant="ghost" @click="offset3d = 0">hoje</UButton>
        <UButton size="xs" variant="ghost" @click="offset3d++">próximo ›</UButton>
      </div>
    </div>
    <AgendaMiniCalendar :offset="offset3d" @go="d => offset3d = d" />
    <AgendaAgendaGrid :range="range" :events="events.data.value ?? []" />
  </UContainer>
</template>
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(ui): agenda view with mini calendar and 3-day grid"
```

---

## Milestone J — Settings, admin, rate limit (Tasks 33–35)

### Task 33: Settings hub page + `PessoaAutocomplete`

**Files:**
- Create: `app/pages/settings/index.vue`
- Create: `app/components/delegacao/PessoaAutocomplete.vue`

- [ ] **Step 1: Create settings hub**

```vue
<!-- app/pages/settings/index.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
</script>
<template>
  <UContainer class="py-6 space-y-4">
    <h1 class="text-xl font-semibold">Configurações</h1>
    <ul class="space-y-2">
      <li><NuxtLink to="/settings/people" class="text-blue-600">Pessoas e assistente</NuxtLink></li>
      <li><NuxtLink to="/settings/devices" class="text-blue-600">Dispositivos e passkeys</NuxtLink></li>
    </ul>
  </UContainer>
</template>
```

- [ ] **Step 2: Implement `PessoaAutocomplete.vue`**

```vue
<script setup lang="ts">
const props = defineProps<{ modelValue: string | null; name: string }>()
const emit = defineEmits<{ 'update:modelValue': [string|null]; 'update:name': [string] }>()
const { list } = usePeople()
const query = ref(props.name ?? '')

const matches = computed(() => {
  const q = query.value.toLowerCase()
  return (list.data.value ?? []).filter(p => p.name.toLowerCase().includes(q))
})

function pick(p: any) {
  emit('update:modelValue', p.id)
  emit('update:name', p.name)
  query.value = p.name
}
function clear() {
  emit('update:modelValue', null); emit('update:name', query.value)
}
watch(query, (v) => emit('update:name', v))
</script>

<template>
  <div class="relative">
    <UInput v-model="query" placeholder="Delegar para…" />
    <ul v-if="query && matches.length" class="absolute bg-white border rounded shadow-lg mt-1 w-full z-10 text-sm">
      <li v-for="p in matches" :key="p.id" class="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between"
          @click="pick(p)">
        <span>{{ p.name }}</span>
        <span v-if="!p.linkedUserId" class="text-gray-400 text-xs">sem conta</span>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(ui): settings hub + person autocomplete with pending state"
```

---

### Task 34: Admin `/admin/users` + reset-devices endpoint

**Files:**
- Create: `server/api/admin/users.get.ts`
- Create: `server/api/admin/users/[id]/reset-devices.post.ts`
- Create: `app/pages/admin/users/index.vue`
- Create: `app/pages/admin/users/[id].vue`
- Create: `app/middleware/admin.ts`

- [ ] **Step 1: Write admin middleware**

```ts
// app/middleware/admin.ts
export default defineNuxtRouteMiddleware(async () => {
  const user = useState<any>('auth:user').value
  if (!user) return navigateTo('/login')
  if (user.role !== 'owner') return navigateTo('/trabalho')
})
```

- [ ] **Step 2: Write failing test for reset-devices**

```ts
// tests/integration/admin-reset.test.ts
import { describe, it, expect } from 'vitest'
import { useTestDb, seedUser, seedSession, addPasskey } from './helpers'

describe('POST /api/admin/users/:id/reset-devices', () => {
  it('deletes all passkeys of target user — only callable by owner', async () => {
    const { db, request, context } = await useTestDb()
    const owner = await seedUser(db, { email: 'o@o', role: 'owner' })
    const delegate = await seedUser(db, { email: 'd@d' })
    await addPasskey(db, { userId: delegate })
    await addPasskey(db, { userId: delegate })
    const { sessionToken } = await seedSession(db, { userId: owner })

    const res = await request(`/api/admin/users/${delegate}/reset-devices`, {
      method: 'POST', headers: { Cookie: `comando.session=${sessionToken}` },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(context.schema.passkeys)
    expect(rows.length).toBe(0)
  })

  it('403 when caller is not owner', async () => {
    const { db, request } = await useTestDb()
    const delegate = await seedUser(db, { email: 'd@d', role: 'delegate' })
    const { sessionToken } = await seedSession(db, { userId: delegate })
    const res = await request(`/api/admin/users/${delegate}/reset-devices`, {
      method: 'POST', headers: { Cookie: `comando.session=${sessionToken}` },
    })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 3: Implement endpoints**

```ts
// server/api/admin/users.get.ts
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { users, passkeys } from '~/server/db/schema'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  if (user.role !== 'owner') throw createApiError(ErrCode.FORBIDDEN, 'Apenas owner.')
  const db = useDb(event)
  const rows = await db.select().from(users)
  const pkCounts = await db.select({ userId: passkeys.userId }).from(passkeys)
  const counts: Record<string, number> = {}
  for (const p of pkCounts) counts[p.userId] = (counts[p.userId] ?? 0) + 1
  return { users: rows.map(u => ({ ...u, passkeyCount: counts[u.id] ?? 0 })) }
})
```

```ts
// server/api/admin/users/[id]/reset-devices.post.ts
import { eq } from 'drizzle-orm'
import { useDb } from '~/server/utils/db'
import { requireAuthedUser } from '~/server/utils/auth'
import { passkeys, deviceApprovals } from '~/server/db/schema'
import { writeAudit } from '~/server/utils/audit'
import { createApiError, ErrCode } from '~/server/utils/errors'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  if (user.role !== 'owner') throw createApiError(ErrCode.FORBIDDEN, 'Apenas owner.')
  const targetId = getRouterParam(event, 'id')!
  const db = useDb(event)
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(passkeys).where(eq(passkeys.userId, targetId))
    await tx.delete(passkeys).where(eq(passkeys.userId, targetId))
    await tx.delete(deviceApprovals).where(eq(deviceApprovals.userId, targetId))
    await writeAudit(tx, {
      entity: 'user', entityId: targetId, action: 'update',
      actorUserId: user.id,
      changes: { passkeys: { from: existing.length, to: 0 } },
      context: { action: 'reset-devices', by: user.id },
    })
  })
  return { ok: true }
})
```

Note: the `tx.delete(passkeys)` and `tx.delete(deviceApprovals)` will trip the lint rule. Add a specific exception via comment or move into `auditedDelete`-like bulk helper. For this admin-only case, extend `server/utils/audit.ts` with:

```ts
export async function auditedBulkDelete(tx: any, table: PgTable, whereExpr: any, actorUserId: string, opts: { entity: string; context?: any }) {
  const before = await tx.select().from(table).where(whereExpr)
  await tx.delete(table).where(whereExpr)
  for (const row of before) {
    await writeAudit(tx, {
      entity: opts.entity, entityId: (row as any).id, action: 'delete',
      actorUserId, changes: { delete: row }, context: opts.context ?? null,
    })
  }
}
```

Then use it.

- [ ] **Step 4: Create admin pages**

```vue
<!-- app/pages/admin/users/index.vue -->
<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'admin'] })
const { data } = await useFetch('/api/admin/users')
</script>
<template>
  <UContainer class="py-6 space-y-3">
    <h1 class="text-xl font-semibold">Admin — Usuários</h1>
    <ul class="space-y-2">
      <li v-for="u in data?.users ?? []" :key="u.id" class="border rounded p-3 flex items-center gap-3">
        <span class="flex-1">{{ u.name }} · {{ u.email }} · role {{ u.role }} · {{ u.passkeyCount }} passkeys</span>
        <NuxtLink :to="`/admin/users/${u.id}`" class="text-blue-600 text-sm">Gerenciar</NuxtLink>
      </li>
    </ul>
  </UContainer>
</template>
```

```vue
<!-- app/pages/admin/users/[id].vue -->
<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'admin'] })
const route = useRoute()
const id = route.params.id as string

async function resetDevices() {
  if (!confirm('Resetar dispositivos deste usuário?')) return
  await $fetch(`/api/admin/users/${id}/reset-devices`, { method: 'POST' })
  alert('Dispositivos resetados. O usuário voltará ao bootstrap.')
}
</script>
<template>
  <UContainer class="py-6 space-y-3">
    <NuxtLink to="/admin/users" class="text-sm text-blue-600">‹ voltar</NuxtLink>
    <h1 class="text-xl font-semibold">Usuário {{ id }}</h1>
    <UButton color="red" @click="resetDevices">Resetar dispositivos (passkeys + approvals)</UButton>
  </UContainer>
</template>
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(admin): users listing + reset-devices endpoint and page"
```

---

### Task 35: Rate-limit middleware applied to sensitive endpoints

**Files:**
- Create: `server/middleware/01.rateLimit.ts`
- Modify: `server/api/auth/email-otp/send.post.ts` (already calls)
- Modify: Rate limit on OTP verify, challenge.get, decide.post, passkey authenticate

- [ ] **Step 1: Implement middleware**

```ts
// server/middleware/01.rateLimit.ts
import { checkRateLimit } from '~/server/utils/rateLimit'

const RULES: { match: RegExp; limit: number; windowSec: number; keyBy: 'ip' | 'email' }[] = [
  { match: /^\/api\/auth\/email-otp\/send$/,       limit: 5,  windowSec: 3600, keyBy: 'email' },
  { match: /^\/api\/auth\/email-otp\/verify$/,     limit: 10, windowSec: 3600, keyBy: 'email' },
  { match: /^\/api\/auth\/device-approvals\/[^/]+\/decide$/, limit: 30, windowSec: 3600, keyBy: 'ip' },
  { match: /^\/api\/auth\/passkey\/authenticate/,  limit: 20, windowSec: 60,   keyBy: 'ip' },
]

export default defineEventHandler(async (event) => {
  const path = event.node.req.url?.split('?')[0] ?? ''
  for (const r of RULES) {
    if (!r.match.test(path)) continue
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? '0.0.0.0'
    let subject = ip
    if (r.keyBy === 'email') {
      try {
        const body = await readBody(event) as any
        if (body?.email) subject = body.email
      } catch {}
    }
    await checkRateLimit(event, { key: `${path}:${subject}`, limit: r.limit, windowSec: r.windowSec })
    return   // first matching rule wins
  }
})
```

- [ ] **Step 2: Write integration test**

```ts
// tests/integration/rateLimit.test.ts
import { describe, it, expect } from 'vitest'
import { useTestDb } from './helpers'

describe('rate-limit middleware', () => {
  it('blocks after N send-otp calls from same email', async () => {
    const { request } = await useTestDb()
    for (let i = 0; i < 5; i++) {
      const r = await request('/api/auth/email-otp/send', { method: 'POST', body: { email: 'spam@x' } })
      expect([200, 404, 400]).toContain(r.status)
    }
    const r6 = await request('/api/auth/email-otp/send', { method: 'POST', body: { email: 'spam@x' } })
    expect(r6.status).toBe(429)
    expect(r6.body.error.code).toBe('ERR_RATE_LIMITED')
  })
})
```

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(auth): rate-limit middleware applied to sensitive endpoints"
```

---

## Milestone K — Deploy + smoke E2E (Task 36)

### Task 36: Cloudflare deploy + CI + Playwright smoke test

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/bootstrap.spec.ts`
- Modify: `wrangler.toml` with production bindings (placeholders for Brunno)
- Modify: `README.md` with deploy steps

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
})
```

- [ ] **Step 3: Write a smoke bootstrap E2E**

`tests/e2e/bootstrap.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('login page renders and accepts email OTP form', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entrar no Comando' })).toBeVisible()
  await page.getByPlaceholder('seu@email.com').fill('noone@example.com')
  // Without a real Resend key, the endpoint stubs and returns 200; UI progresses to OTP step.
  await page.getByRole('button', { name: /enviar código/i }).click()
  await expect(page.getByPlaceholder('6 dígitos')).toBeVisible()
})
```

WebAuthn-heavy flows are covered in a follow-up test using `@web-auth/virtual-authenticator` (not included in Phase 1 smoke test; add after deploy).

- [ ] **Step 4: CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: comando_test }
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U postgres"
    env:
      TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/comando_test
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/comando_test
      AUTH_SECRET: ci-secret-not-real
      SITE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm drizzle-kit migrate
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 5: Deploy workflow** (separate file, manual trigger)

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on: { workflow_dispatch: {} }

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: pnpm drizzle-kit migrate
      - run: pnpm build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

- [ ] **Step 6: Document deploy in README**

Append to `README.md`:

````markdown
## Production deploy

Brunno provisions in Cloudflare:

1. Worker `comando` (created on first `wrangler deploy`).
2. Hyperdrive binding pointing to Railway Postgres connection string.
3. Secrets: `AUTH_SECRET`, `RESEND_API_KEY`, `ADMIN_BOOTSTRAP_EMAIL`.

Then runs:
```bash
pnpm install
pnpm drizzle-kit migrate   # against production DATABASE_URL
wrangler secret put AUTH_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put ADMIN_BOOTSTRAP_EMAIL
pnpm build
wrangler deploy
```

First login uses bootstrap — see app/pages/login.vue. Admin is seeded via direct SQL:
```sql
UPDATE users SET role='owner' WHERE email = '<brunno email>';
```
````

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore(deploy): CI + deploy workflows + smoke E2E + readme"
```

- [ ] **Step 8: Run full test suite end-to-end**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm playwright test
```

All green → Phase 1 ready for Brunno's hands-on testing and deploy.

---

## Self-review

### Spec coverage

Reconciling the spec (`docs/superpowers/specs/2026-04-23-comando-design.md`) against the tasks:

| Spec section                                              | Task(s)              |
|-----------------------------------------------------------|----------------------|
| §2 Stack + per-request DB                                 | 2, 4, 5              |
| §4.1 Auth tables                                          | 6                    |
| §4.2 `people`, `person_invitations`                       | 18                   |
| §4.2 `device_approvals`                                   | 10                   |
| §4.2 `tasks`, `checklist_items`, `task_annotations`       | 22                   |
| §4.2 `audit_log`                                          | 15                   |
| §4.4 Access filter                                        | 17 (stub), 23 (full) |
| §5.1 Bootstrap                                            | 7, 8, 9              |
| §5.2 Login in trusted device                              | 9 (composable)       |
| §5.3 New device requests approval                         | 8, 10                |
| §5.4 Signed approval (step-up)                            | 11, 12, 13, 14       |
| §5.5 Invitation flow                                      | 20, 21               |
| §5.6 Recovery                                             | 34                   |
| §5.7 Rate limiting                                        | 10, 35               |
| §6.1 Task types with delegation                           | 24                   |
| §6.2 Two views from one row                               | 23, 24               |
| §6.3 Permissions (both can do all; reassign=creator only) | 24                   |
| §6.4 Delegate-before-account (retroactive)                | 18, 20               |
| §6.5 `auditedUpdate`                                      | 15                   |
| §6.6 Timeline UI                                          | 17, 31               |
| §6.7 Reagendamentos derived                               | 27                   |
| §6.7 TanStack Query polling                               | 30, 32               |
| §7 File layout                                            | Covered across tasks |
| §8 Phase 1 deliverables                                   | All of 1–36          |
| §9 Tests + error model                                    | Per-task             |

No spec section is uncovered.

### Placeholder scan

Searched plan for "TBD", "TODO", "implement later", "similar to Task N". Remaining notes that deserve flagging:

- **Task 8 uses `parseCredentialIdFromAssertion` with a weak fallback** when the UI doesn't forward `credentialId` explicitly. The composable in Task 13 should be extended to forward `cred.id` (base64url of credential ID) inside `body.credentialId` — **engineer should do this while implementing Task 13 step 2**. Noted in Task 12 step 3.
- **Task 12 note about onboardingSessionId** — retroactively add that column via an extra migration when implementing Task 12. The plan flags this explicitly.
- The `tx.delete(...)` / `tx.update(...)` lint exceptions — all flagged in their respective tasks, with refactor direction pointing to `auditedUpdate` / `auditedDelete` / `auditedBulkDelete`. Engineer should prefer those helpers.
- **Task 26 annotations test outline** — expand the 3 test cases into concrete code mirroring the shape in Task 24; engineer writes them during implementation.

None are blocking placeholders; all are "apply this note while implementing" hints.

### Type consistency

- `tasks.scheduledDate` stored as `date` (postgres), typed as `string` (ISO yyyy-mm-dd) across the stack — UI and backend both use `string | null`.
- `tasks.type` enum values (`ceo`, `delegate`, `personal`) used consistently in API payloads, DB, and UI (with PT labels applied at render time).
- `horizon` enum — backend uses `hibernating`, UI prototype uses `hibernando`. Mapping functions `horizonUIToDb` / `horizonDbToUI` are defined in Task 29 and used at all UI↔API boundaries.
- `delegatePersonId` (camelCase in TS; `delegate_person_id` in SQL — Drizzle handles mapping).
- Audit `action` enum values consistent across `inferAction`, `writeAudit`, and `auditedBulkDelete`.

No inconsistencies found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-comando-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a 36-task plan where context pollution is the main risk.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**

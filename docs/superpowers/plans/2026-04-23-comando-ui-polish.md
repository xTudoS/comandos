# Comando — UI Polish Plan (3 PRs)

> Post-Phase-2 UI/UX pass. Keep the current clean Apple-ish feel; fix the concrete gaps flagged on 2026-04-23: empty login, flat KPIs, dashboard panels still showing "Em breve" after Phase 2 shipped, and six empty horizon sections competing for attention.

**Ground rules**
- Portuguese UI strings, English code/comments (project convention).
- Reuse CSS tokens from `app/assets/css/main.css` (`--accent`, `--danger`, `--surface`, etc.). No raw hex in components.
- Icons come from `lucide-vue-next` (already in scope per Phase-1 plan). No emoji.
- Each PR is a single commit on `main` following the existing `feat(area): …` convention.
- Each PR leaves `npm run lint` + `npm run typecheck` green. Full test run optional (existing h3 v2 drift blocks vitest; see memory).
- After each PR: update `memory/comando_state.md` with the commit hash.

---

## PR #1 — Login redesign + auth shell

**Problem:** `app/pages/login.vue` is a bare `UContainer` with a heading and a loose "ou" divider. `app/layouts/auth.vue` only centers a slot. Zero brand presence; passkey (the preferred path) is visually equal to OTP fallback. Colors drift from tokens (raw `text-red-600`, emerald).

**Scope**

1. Rewrite `app/layouts/auth.vue` as a **split shell** (brand panel left, form panel right). Single column on `< 780px`. Both sides inside a `min-h-dvh` container.
2. Rewrite `app/pages/login.vue`:
   - **Brand panel** (left): wordmark "Comando", one-line tagline, subtle date in the same `DOW, dd de MÊS · YYYY` format used in the topbar.
   - **Form panel** (right):
     - **Passkey hero** — full-width primary `UButton` with Lucide `KeyRound` icon, caption "Mais rápido. Funciona offline depois do primeiro uso."
     - **Divider** — `<div class="or">ou entrar com email</div>` using an hr-like pseudo-element on both sides.
     - Email input → "Enviar código".
     - OTP step keeps same structure but: show masked email, add "reenviar em Xs" cooldown (simple client-only countdown, 30s).
   - Replace `text-red-600` with `var(--danger)` via a `.err` class that matches the rest of the app.
   - Replace emerald `notice` with `var(--accent-soft)` + `var(--accent)` text.
3. Micro-copy pass: "Código enviado para {{email}}" → "Enviamos um código para **{{email}}**. Chega em até 30s."

**Files**
- `app/layouts/auth.vue` — full rewrite (~40 LOC)
- `app/pages/login.vue` — full rewrite (~180 LOC)
- `app/pages/login/waiting.vue` — align visual with new auth shell (inherits layout change; minor touch-up if anything breaks)

**Acceptance**
- [ ] Desktop: 2-column split at `≥ 900px`, brand panel ≈ 42% width, form panel ≈ 58%.
- [ ] Mobile: single column, brand compacted to logo + 1 line above form.
- [ ] Passkey button clearly primary (filled `--accent`), OTP submit is secondary-filled.
- [ ] All text/colors resolve to tokens from `main.css` — no `text-red-*`, no emerald, no raw hex.
- [ ] Lucide icons render at `18px` next to passkey / email button labels.
- [ ] Error path `extractMessage` unchanged (no regression in API contract).
- [ ] Retry flow (`?retry=<email>`) still auto-sends OTP and surfaces `notice`.
- [ ] `/login/waiting` still centers inside the new auth shell with no layout break.

**Risks**
- `UButton` Nuxt-UI v3 icon slot prop is `leading-icon` — verify, fall back to `<template #leading>` with inline SVG if the prop shape differs.
- `env(safe-area-inset-*)` needed on mobile to avoid notch clash on brand panel.

**Commit:** `feat(login): redesign auth shell — split layout + passkey hero + token fixes`

---

## PR #2 — Topbar, KPIs, and tabs hierarchy

**Problem:** Topbar renders 6 KPI cards of equal weight. With zero activity the screen reads "0 0 0 0 0 0" before anything useful. Tabs row uses labels only — "Arquivo 0" vs "Trabalho 0" have identical affordance. Two buttons ("Importar", "Exportar") both route to `/settings/backup`.

**Scope**

1. **`app/components/topbar/Kpis.vue`** — rebuild as:
   - **Primary** (always visible): `ATIVAS` + `HOJE`. Larger value (20px, 600 weight), label below.
   - **Secondary** (chips): `CEO`, `DELEGO`, `CORE 30`, `FOLLOW-UP`. Shown only when value > 0; otherwise hidden. On mobile (< 900px) collapse all secondaries behind a `… +N` chip that opens a popover.
   - Semantic colors unchanged (ceo/delego/followup tokens).
2. **`app/components/topbar/Topbar.vue`** — collapse "Importar" + "Exportar" into one `UDropdownMenu` "Backup" action (items: Exportar, Importar). "+ Tarefa" stays as primary action.
3. **`app/layouts/default.vue`** — tabs row:
   - Add Lucide icon next to each label (CheckSquare / Calendar / DollarSign / Folder / FileText / Archive).
   - Show badge **only when count > 0**. Keep tabular-nums for alignment.
   - Keep current active state (border-bottom + `--accent`).
4. Consistency: replace the inline `<span class="badge">` with a reusable `<Badge :count>` helper inside `app/components/topbar/`. Used by tabs now, available for mobile tab bar later.

**Files**
- `app/components/topbar/Kpis.vue` — restructured (~140 LOC)
- `app/components/topbar/Topbar.vue` — actions slot collapsed (~80 LOC)
- `app/layouts/default.vue` — tabs template + mobile tabs (keep current behavior, new icons)
- `app/components/topbar/Badge.vue` — new, ~30 LOC

**Acceptance**
- [ ] At 0 activity: only ATIVAS (0) + HOJE (0) visible; secondaries hidden; no visual noise.
- [ ] At mixed activity: secondaries appear inline; tabs show badge only when > 0.
- [ ] Mobile: secondaries collapse behind `… +N` chip; popover opens on tap.
- [ ] Icons 16–18px, stroke 1.5, aligned to label baseline; no layout shift when badge toggles.
- [ ] Backup dropdown keyboard-navigable; escape closes.
- [ ] `npm run typecheck` clean.

**Risks**
- `UDropdownMenu` API in Nuxt-UI v3 — verify item shape. Fallback: plain `<details>` disclosure.
- Secondary-KPI responsive popover needs a lightweight anchored popover; prefer Nuxt UI `UPopover` if available.

**Commit:** `feat(topbar): tiered KPIs + icons on tabs + unified backup action`

---

## PR #3 — Trabalho dashboard refactor

**Problem:** `app/pages/trabalho.vue` renders six horizon panels at once (all empty by default = 6 copies of "Vazio. Arraste tarefas aqui."); two side panels ("Pagamentos" / "Notas") still show `<div class="empty-state">Em breve</div>` at **lines 133-152** despite Phase 2 shipping both features. Agenda panel duplicates its navigation (label+nav block + legend button row).

**Scope**

1. **New `app/components/PageHeader.vue`** — shared title/desc/actions header used by `/trabalho`, `/agenda`, `/pagamentos`, `/notas`, `/projetos`, `/arquivo`. Replaces the 2 local patterns (`panel-head` vs `clean-head`). Keep existing visual — just one source of truth.
2. **`app/pages/trabalho.vue`**:
   - **Horizonte collapsing**: `TarefasHorizonteList` gets a `defaultCollapsed` prop. In `trabalho.vue`, pass `defaultCollapsed = (tasks.length === 0 && horizon !== 'core30')`. Collapsed state shows a 28px-tall row with title + count, click expands. Empty state appears only inside expanded panels.
   - **Pagamentos panel**: remove the "Em breve" block. Render live `summary` from `usePayments()` (3 rows: Atrasado / Pendente / Pago mês) + first 3 pending items with due dates. Click → `/pagamentos`.
   - **Notas panel**: remove "Em breve". Render last 3 edited active notes (title + type chip + relative date). Click → `/notas`. Uses `useNotes()`.
   - Consolidate Agenda panel controls: remove the duplicate label+nav block (`.agenda-controls`) at lines 238-276 — the `AgendaMiniCalendar` + legend is enough; put prev/today/next **inside** the legend row.
3. **`app/layouts/default.vue`**:
   - Mobile tab bar: replace hardcoded 4-item array with the same `tabs` list truncated to 5 (bottom-nav-limit rule). Current: `[trabalho, agenda, pagtos, notas]` — after change `[trabalho, agenda, pagtos, notas, arquivo]`. Arquivo becomes reachable on mobile.

**Files**
- `app/components/PageHeader.vue` — new (~50 LOC)
- `app/pages/trabalho.vue` — refactor panels (~260 LOC after)
- `app/components/tarefas/HorizonteList.vue` — accept `defaultCollapsed` prop (find actual path, likely `app/components/tarefas/HorizonteList.vue`)
- `app/layouts/default.vue` — expand mobile tabs to 5
- `app/pages/agenda.vue`, `app/pages/pagamentos.vue`, `app/pages/notas.vue`, `app/pages/projetos.vue`, `app/pages/arquivo.vue` — adopt `PageHeader` (drop local `clean-head`)

**Acceptance**
- [ ] Fresh account, 0 tarefas: Trabalho page shows only Core 30 expanded with quick-capture input; Core 60/90/Micro/Backlog/Hibernando are collapsed rows.
- [ ] With tasks: horizontes that have tasks stay expanded; empty ones still collapse.
- [ ] Pagamentos panel shows real numbers (atrasado/pendente/pago mês) — not "Em breve".
- [ ] Notas panel shows last 3 notas with type chip — not "Em breve".
- [ ] Agenda panel: no duplicate navigation; prev/today/next visible once.
- [ ] All 6 main pages use `<PageHeader>` with identical visual.
- [ ] Mobile bottom-nav shows 5 items including Arquivo; all reachable; active state correct.
- [ ] No horizontal scroll on 375px viewport.
- [ ] `npm run typecheck` + `npm run lint` clean.

**Risks**
- `TarefasHorizonteList` may already have collapse logic — read first.
- The agenda `AgendaMiniCalendar` emits `go(offset)`; make sure the consolidated controls still drive the same state.
- Pagamentos `usePayments` runs a fetch; guard against double-fetch on the dashboard vs the `/pagamentos` page. Use the shared `useState` key it already has.

**Commit:** `feat(dashboard): trabalho re-plug — live pagamentos/notas + collapsed horizons + shared PageHeader`

---

## Out of scope (flagged, not in these PRs)

- **Dark mode tokens** — `main.css` has no dark palette. Worth a dedicated PR after these 3.
- **AnexosList on mobile** — likely overflows in modals on < 400px viewport. Separate audit.
- **Landing page** — auth shell improvement is a patch, not a replacement. Real landing is a Phase-3 item.
- **`/admin/users`** and `/settings/*` polish — not flagged; leave alone.

---

## Sequencing

1. **PR #1** Login + auth shell (no dependencies).
2. **PR #2** Topbar + KPIs + tabs (no dependencies).
3. **PR #3** Trabalho dashboard + `PageHeader`. The shared `PageHeader` touches 6 pages; sequence last so its visual already reflects the new token usage decided above.

Execute autonomously. Stop only for: unexpected API mismatch, Nuxt-UI v3 component not exposing expected prop, or structural surprise in an existing component.

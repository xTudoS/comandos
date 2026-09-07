# Comando · Design Spec (Nuxt 4 / Vue 3)

> Spec de implementação derivado de `Comando_Brunno-2 (1).html`.
> Objetivo: definir **tokens, componentes e uso** para reconstruir 1:1 o produto em Nuxt 4 + Vue 3 + `<script setup>`, mantendo a estética Apple-inspired (SF Pro, frosted glass, bordas suaves) e a UX original.
>
> Este documento é prescritivo: nomes de componentes, props, slots, eventos e classes utilitárias devem ser respeitados para garantir consistência entre páginas.

---

## 0. Sumário

1. Visão geral do produto
2. Princípios de design
3. Stack & estrutura de pastas (Nuxt 4)
4. Tokens de design (cores, tipografia, espaçamento, radius, sombras, motion)
5. Inventário de componentes (mapa 1:1 com o HTML)
6. Componentes base (Atoms)
7. Componentes compostos (Molecules)
8. Componentes de layout / overlays (Organisms)
9. Páginas (Templates) — 7 views
10. Modelo de dados e store (Pinia)
11. Composables
12. Acessibilidade
13. Responsividade
14. Animação & microinterações
15. Anti-patterns
16. Checklist de entrega

---

## 1. Visão geral do produto

| Campo | Valor |
|---|---|
| **Nome** | Comando |
| **Tipo** | Productivity / Personal Command Center (single-user, desktop-first com fallback mobile) |
| **Audiência** | C-level / founder; uso intensivo de teclado; sessões longas. |
| **Idioma** | pt-BR (UI), datas BR (`dd/mm`), valores `R$ x.xxx,xx`. |
| **Persistência atual** | `localStorage` (`comando_brunno_v3`). Em Nuxt: substituir por API + Pinia + `nuxt-storage`/cookies. |
| **Tema** | Light primário (light-mode-first). Dark mode é evolução planejada — todos os tokens devem nascer semânticos para suportá-lo. |
| **Tom visual** | Apple HIG: branco/cinza-claro, accent azul (#0071e3), tipografia compacta e densa, frosted-glass nos chromes, bordas hairline, sombras quase ausentes. |

### 1.1 Views (rotas)

| Rota | View ID original | Função |
|---|---|---|
| `/trabalho` (default) | `view-trabalho` | Cockpit multi-painel (Tarefas + Agenda + Pagamentos + PM + Notas) |
| `/agenda` | `view-agenda` | Agenda em tela cheia (janela de 3 dias) |
| `/pagamentos` | `view-pagamentos` | Lista de pagamentos com filtros |
| `/projetos` | `view-projetos` | Projetos agrupados por categoria, expansíveis |
| `/metas` | `view-metas` | Metas com progresso agregado, expansíveis |
| `/notas` | `view-notas` | Notas em grid responsivo |
| `/arquivo` | `view-arquivo` | Tudo arquivado, restaurar/deletar |

### 1.2 Entidades (visão rápida)

| Entidade | Campos chave | Estados |
|---|---|---|
| **Tarefa** | `titulo, horizonte, tipo, projeto_id, meta_id, data, hora, duracao, followup, checklist[], anotacoes[], reagendamentos[]` | `done`, `arquivada` |
| **Nota** | `titulo, corpo, tipo (Playbook/Credencial/Contato/Decisão/Referência), projeto_id, status` | `arquivada` |
| **Projeto** | `nome, categoria (empresa/produto/geral/pessoal), empresa_id?, meta_id?, notas` | `arquivado` |
| **Meta** | `titulo, descricao, prazo` | `arquivada`, derivados: `ativa/vencida/concluida` |
| **Pagamento** | `descricao, valor, data, status (pendente/pago), notas` | `arquivado`, derivado: `atrasado` |

---

## 2. Princípios de design

1. **Densidade controlada.** Topbar 40px, fontes 11–14px na maioria dos lugares. Nunca usar `<= 11px` para conteúdo legível — só labels uppercase.
2. **Hairline acima de sombra.** Cards usam `border 1px var(--border)`; sombra só em modais e tooltips.
3. **Cor é semântica.** Cada entidade tem cor "default" + cor de estado. Nunca hex inline em componentes — use tokens.
4. **Frosted glass nos chromes.** Topbar, tabs e panel-heads usam `backdrop-filter: blur(20px) saturate(180%)`. Nunca em conteúdo.
5. **Tabular nums em todo número.** Datas, valores, %, contadores → `font-variant-numeric: tabular-nums`.
6. **Sticky headers.** Tudo que rola tem header sticky com fundo translúcido para scroll-bleed.
7. **Drag & drop como cidadão de primeira classe.** Tarefas se movem entre horizontes por arrasto; o card mostra `cursor: grab`/`grabbing`.
8. **Modais centralizados.** Toda criação/edição usa `Modal` — nunca página de detalhe separada (manter o cockpit visível mentalmente).
9. **Toast para confirmação positiva, modal de confirm para destrutivo.**
10. **`renderAll()` é equivalente a `state-reactive`.** No Vue, todo derivado é `computed` em cima de Pinia; nada de re-render manual.

---

## 3. Stack & estrutura de pastas (Nuxt 4)

### 3.1 Stack

- **Nuxt 4** (`srcDir: "app"`)
- **Vue 3** com `<script setup lang="ts">`
- **TypeScript** estrito
- **Pinia** (state)
- **VueUse** (`useDraggable`, `useEventListener`, `useDateFormat`, `useStorage` para hidratação inicial)
- **CSS**: nativo + custom properties (sem Tailwind por padrão; o HTML já carrega um sistema de tokens consistente — replicá-lo cru é o caminho mais fiel). Se o time exigir Tailwind, ver §4.6.
- **Date-fns** com locale `pt-BR` (substitui as helpers manuais `fmtBRDate`, `addDays`, etc).
- **@vueuse/integrations/useDrag** ou implementação nativa HTML5 DnD (já era nativa no original).
- **Heroicons** ou **Lucide** para ícones SVG. **Proibido emoji estrutural** — todos os "✕", "‹›", "▾", "⏳", "→", "◎", "✦", "$", "⊙" do original devem virar `<Icon name="..."/>`.

### 3.2 Estrutura de pastas

```
app/
├─ assets/
│  └─ css/
│     ├─ tokens.css            # design tokens (§4)
│     ├─ reset.css             # reset/base
│     └─ utilities.css         # classes utilitárias (.font-mono, .tabular, etc)
├─ components/
│  ├─ base/                    # Atoms
│  │  ├─ BaseButton.vue
│  │  ├─ BaseBadge.vue
│  │  ├─ BaseInput.vue
│  │  ├─ BaseTextarea.vue
│  │  ├─ BaseSelect.vue
│  │  ├─ BaseToggle.vue
│  │  ├─ BaseCheckbox.vue       # check redondo (tarefa)
│  │  ├─ BaseCheckboxSquare.vue # check quadrado (checklist)
│  │  ├─ BaseProgressBar.vue
│  │  ├─ BaseFilterPills.vue
│  │  ├─ BaseEmptyState.vue
│  │  ├─ BaseTooltip.vue
│  │  ├─ BaseField.vue
│  │  └─ BaseIcon.vue
│  ├─ chrome/                  # Layout/cromos (Organisms)
│  │  ├─ AppTopbar.vue
│  │  ├─ AppTabsMain.vue
│  │  ├─ AppMobileTabs.vue
│  │  ├─ AppPanel.vue
│  │  ├─ AppToast.vue
│  │  └─ AppModal.vue
│  ├─ tarefas/
│  │  ├─ TarefaCard.vue
│  │  ├─ TarefaInbox.vue
│  │  ├─ TarefaHorizonte.vue
│  │  ├─ TarefaChecklist.vue
│  │  ├─ TarefaAnotacoes.vue
│  │  └─ TarefaReagendamentos.vue
│  ├─ agenda/
│  │  ├─ AgendaMiniCalendar.vue
│  │  ├─ AgendaLegend.vue
│  │  ├─ AgendaControls.vue
│  │  ├─ AgendaGrid3D.vue          # 3-day grid (head + allday + body)
│  │  ├─ AgendaEvent.vue
│  │  └─ AgendaTooltip.vue
│  ├─ pagamentos/
│  │  ├─ PagamentoMiniResumo.vue
│  │  ├─ PagamentoMiniItem.vue
│  │  ├─ PagamentoResumoCard.vue
│  │  └─ PagamentoCard.vue
│  ├─ projetos/
│  │  ├─ ProjetoCardExpandable.vue
│  │  ├─ ProjetoQuickAdd.vue
│  │  └─ ProjetoGrupo.vue
│  ├─ metas/
│  │  ├─ MetaCardExpandable.vue
│  │  └─ MetaQuickAdd.vue
│  ├─ notas/
│  │  └─ NotaCard.vue
│  ├─ arquivo/
│  │  └─ ArquivoItem.vue
│  ├─ pm/
│  │  ├─ PMSection.vue
│  │  └─ PMMiniCard.vue
│  ├─ kpis/
│  │  └─ KPIBadge.vue
│  └─ modals/
│     ├─ ModalTarefa.vue
│     ├─ ModalNota.vue
│     ├─ ModalProjeto.vue
│     ├─ ModalMeta.vue
│     ├─ ModalPagamento.vue
│     └─ ModalConfirm.vue
├─ composables/
│  ├─ useToast.ts
│  ├─ useConfirm.ts
│  ├─ useTooltip.ts
│  ├─ useDragTask.ts
│  ├─ useFormatBR.ts            # fmtBRL, fmtBRDate, fmtNowStamp, fmtBRLShort
│  ├─ useHorizontes.ts          # constante HORIZONTES + helpers
│  ├─ useProgresso.ts           # progressoProjeto, progressoMeta, checklistPct
│  └─ useStatus.ts              # statusPagamento, statusMeta, diasAtePrazo
├─ stores/
│  ├─ tarefas.ts
│  ├─ notas.ts
│  ├─ projetos.ts
│  ├─ metas.ts
│  ├─ pagamentos.ts
│  ├─ ui.ts                     # view ativa, offsets, filtros, expansões
│  └─ persistence.ts            # load/save/import/export
├─ layouts/
│  └─ default.vue               # Topbar + TabsMain + <slot/> + AppToast + AppMobileTabs
├─ pages/
│  ├─ index.vue                 # redirect → /trabalho
│  ├─ trabalho.vue
│  ├─ agenda.vue
│  ├─ pagamentos.vue
│  ├─ projetos.vue
│  ├─ metas.vue
│  ├─ notas.vue
│  └─ arquivo.vue
├─ types/
│  ├─ tarefa.ts
│  ├─ nota.ts
│  ├─ projeto.ts
│  ├─ meta.ts
│  └─ pagamento.ts
├─ utils/
│  └─ uid.ts
└─ app.vue
```

---

## 4. Tokens de design

> ⚠️ **SUPERADO — leia `design-system/MASTER.md` antes de usar esta seção.**
>
> Esta seção descreve a intenção original. A implementação divergiu em três
> pontos, de propósito:
>
> 1. **A fonte de verdade é `packages/ui/app/assets/css/main.css`, não `tokens.css`.** Os
>    nomes canônicos são os curtos (`--bg`, `--surface`, `--text`, `--accent`),
>    não o prefixo `--color-*` documentado abaixo. `tokens.css` virou camada de
>    alias em depreciação. Motivo: 75 arquivos já usavam os nomes curtos contra
>    34 nos longos.
> 2. **`--dur-base` é 240ms, não os 150ms de §4.6.** Os dois arquivos declaravam
>    os mesmos tokens de duração e `main.css` carregava depois — 240ms sempre foi
>    o valor real em produção. A colisão foi removida e o valor que roda ficou.
> 3. **Dark mode foi removido** (§1 previa como evolução). O app é light-only.
>
> As escalas de tipografia, radius e espaçamento agora são **fechadas** e
> verificadas por `pnpm lint:tokens`. A lista válida está no MASTER §2 — não nas
> tabelas abaixo, que estão desatualizadas.
>
> Os valores de **cor** abaixo continuam corretos; só os nomes mudaram.

### 4.1 Cores

```css
:root {
  /* === SUPERFÍCIES === */
  --color-bg:              #f5f5f7;   /* fundo da app (cinza Apple) */
  --color-surface:         #ffffff;   /* card / input / modal */
  --color-surface-alt:     #fafafa;   /* sub-superfície (zebra leve) */
  --color-surface-hover:   #f2f2f5;   /* hover de superfície */

  /* === BORDAS === */
  --color-border:          #e5e5ea;   /* hairline */
  --color-border-strong:   #d1d1d6;   /* contornos de input/botão ghost */

  /* === TEXTO === */
  --color-text:            #1d1d1f;   /* corpo / heading */
  --color-text-2:          #515154;   /* secundário */
  --color-text-3:          #86868b;   /* terciário (labels, sub) */
  --color-text-4:          #aeaeb2;   /* placeholder / disabled */

  /* === BRAND / ESTADOS === */
  --color-accent:          #0071e3;
  --color-accent-hover:    #0077ed;
  --color-accent-soft:     #e8f1fd;   /* fundo de pill ativo */

  --color-success:         #30a46c;
  --color-warning:         #d97706;   /* + amber alias */
  --color-amber:           #b06a00;
  --color-amber-bg:        #fef4e6;
  --color-danger:          #d93141;

  /* === ENTIDADES — TIPO DE TAREFA === */
  --color-ceo-bg:          #fff0ee;
  --color-ceo-fg:          #c9342a;
  --color-delego-bg:       #e8f5ed;
  --color-delego-fg:       #1d7a45;
  --color-pessoal-bg:      #fef4e6;
  --color-pessoal-fg:      #b06a00;

  /* === HORIZONTES (barra lateral) === */
  --color-h-core30:        #d93141;
  --color-h-core60:        #d97706;
  --color-h-core90:        #30a46c;
  --color-h-micro:         #5856d6;
  --color-h-backlog:       #8e8e93;
  --color-h-hibernando:    #636366;

  /* === FOLLOWUP === */
  --color-followup-bg:     #fef4e6;
  --color-followup-fg:     #b06a00;

  /* === PAGAMENTOS (status) === */
  --color-pag-pendente:    #d97706;
  --color-pag-pago:        #30a46c;
  --color-pag-atrasado:    #d93141;

  /* === NOTAS (tipo) === */
  --color-nota-playbook:    #5856d6;
  --color-nota-credencial:  #d93141;
  --color-nota-contato:     #30a46c;
  --color-nota-decisao:     #0071e3;
  --color-nota-referencia:  #8e8e93;

  /* === PROJETOS (categoria) — pílulas === */
  --color-proj-empresa-bg:    #eef2ff;  --color-proj-empresa-bd: #c7d2fe;  --color-proj-empresa-fg: #4338ca;
  --color-proj-produto-bg:    #f0fdf4;  --color-proj-produto-bd: #bbf7d0;  --color-proj-produto-fg: #15803d;
  --color-proj-geral-bg:      #fefce8;  --color-proj-geral-bd:   #fde68a;  --color-proj-geral-fg:   #854d0e;
  --color-proj-pessoal-bg:    #fdf2f8;  --color-proj-pessoal-bd: #fbcfe8;  --color-proj-pessoal-fg: #9d174d;

  /* === METAS (gradiente / azul iOS) === */
  --color-meta-from:       #0a84ff;
  --color-meta-to:         #5e9eff;
  --color-meta-vencida-from: #ff453a;
  --color-meta-vencida-to:   #ff6961;
  --color-progresso-from:    #34c759;
  --color-progresso-to:      #30d158;
  --color-progresso-full-from: #007aff;
  --color-progresso-full-to:   #0a84ff;
}
```

### 4.2 Tipografia

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
               "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: "SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, monospace;

  /* Escala (px) */
  --fs-9:  9px;   /* labels DOW mini-cal */
  --fs-10: 10px;  /* labels uppercase, badges, meta */
  --fs-11: 11px;  /* sub, count, helpers */
  --fs-12: 12px;  /* descrições, status */
  --fs-13: 13px;  /* corpo de cards, tabs, botões */
  --fs-14: 14px;  /* corpo principal, inputs */
  --fs-15: 15px;  /* títulos da topbar / KPI val */
  --fs-16: 16px;  /* H3 modal */
  --fs-18: 18px;  /* dnum agenda head */
  --fs-20: 20px;  /* valor resumo pagamento */
  --fs-22: 22px;  /* H2 das views clean */
  --fs-32: 32px;  /* big do empty-state */

  /* Pesos */
  --fw-regular: 400;
  --fw-medium:  500;
  --fw-semibold: 600;
  --fw-bold:    700;

  /* Line heights */
  --lh-tight: 1.2;
  --lh-snug:  1.3;
  --lh-base:  1.45;  /* body padrão */
  --lh-relaxed: 1.55;

  /* Letter spacing */
  --ls-uppercase: 0.05em;   /* labels uppercase */
  --ls-uppercase-tight: 0.04em;
  --ls-h2: -0.02em;
  --ls-h3: -0.015em;
  --ls-h-tab: -0.01em;
  --ls-body: -0.005em;
}
```

**Regras tipográficas**:

- `body` → 14px / 1.45.
- Todo número (datas, R$, %, contadores, hora) → `font-variant-numeric: tabular-nums`.
- Carimbos de tempo, IDs, valores monetários "puros" → `font-mono`.
- Labels de campo, KPIs, sub-headers → `text-transform: uppercase; font-size: 10–11px; letter-spacing: 0.05em; font-weight: 500–600; color: --color-text-3`.
- H2 (clean-head): 22px / 600 / `--ls-h2`.
- H3 (modal-head): 16px / 600 / `--ls-h3`.
- Tab-main label: 13px / 500 / `--ls-h-tab`.

### 4.3 Espaçamento

Sistema **4-base, 4/6/8/10/12/14/16/18/20/24** + casos `30/40/50` para empty-states.

```css
:root {
  --sp-1: 4px;
  --sp-2: 6px;
  --sp-3: 8px;
  --sp-4: 10px;
  --sp-5: 12px;
  --sp-6: 14px;
  --sp-7: 16px;
  --sp-8: 18px;
  --sp-9: 20px;
  --sp-10: 22px;
  --sp-11: 24px;
}
```

Padding canônico:
- Topbar: `10px 20px`
- Panel-head: `12px 16px 10px`
- Panel-body: `12px 16px 40px` (40px reservado para área respirável + mobile-tabs)
- Card de tarefa: `10px 12px`
- Pagamento card (lista cheia): `12px 14px`
- Modal head: `18px 22px 12px`
- Modal body: `18px 22px`
- Modal foot: `14px 22px`
- Mobile-tabs (fixed bottom): `8px 10px calc(8px + env(safe-area-inset-bottom))`

### 4.4 Border-radius

```css
:root {
  --radius-sm: 6px;    /* botões, inputs, cards densos */
  --radius:    10px;   /* cards de pagamento, projeto, nota, mini-cal */
  --radius-lg: 14px;   /* horizonte, inbox, modal */
  --radius-pill: 999px; /* contagem, badges-pílula */
}
```

Convenção:
- Pill (filtros, contagens): `999px`.
- Badge retangular pequeno (badge-projeto): 4px.
- Badge oval (badge-tipo, badge-agenda, badge-followup): 10px.

### 4.5 Sombras

Sombra é **rara**. Apenas:

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);   /* event no agenda-grid */
  --shadow-md: 0 1px 3px rgba(0,0,0,0.10);   /* hover do event */
  --shadow-lg: 0 8px 28px rgba(0,0,0,0.12);  /* modais e tooltip */
}
```

**Não use** sombra em cards de conteúdo (tarefa, projeto, meta, nota, pagamento). Use `border 1px var(--color-border)`.

### 4.6 Motion

```css
:root {
  --dur-instant: 100ms;  /* press scale */
  --dur-fast:    120ms;  /* hover bg */
  --dur-base:    150ms;  /* transitions padrão */
  --dur-medium:  200ms;  /* slideUp do modal */
  --dur-slow:    250ms;  /* progress-bar fill */
  --dur-tooltip-delay: 150ms;

  --easing-default: cubic-bezier(0.16, 1, 0.3, 1); /* expo-out, modal slide */
  --easing-ease-out: ease-out;
  --easing-ease-in:  ease-in;
}
```

**Animações nominais**:
- `fadeIn` 150ms — backdrop modal
- `slideUp` 200ms `cubic-bezier(0.16,1,0.3,1)` — modal
- `pulse 2s infinite` — dot de pagamento atrasado
- progress-bar `transition: width 250ms ease`
- `cursor: pointer` em todo elemento clicável
- `transform: scale(0.97)` em `.btn:active`
- `prefers-reduced-motion` → desabilitar `pulse`, reduzir slideUp para fade puro.

### 4.7 Tailwind (opcional)

Caso o time queira Tailwind, mapear:

| Token | Classe equivalente |
|---|---|
| `--color-bg` | `bg-[#f5f5f7]` ou criar `bg-app` |
| `--color-accent` | `text-blue-600` (#2563eb não casa, configurar `apple-blue: #0071e3`) |

**Recomendação**: usar Tailwind apenas como utilitário de espaçamento/flex/grid e manter os tokens de cor/raio/sombra como `theme.extend.colors`. Manter classes nominais (`.task`, `.horizonte`, `.kpi`) **proibido** no template do componente — use props/state.

---

## 5. Inventário de componentes

Mapa direto entre as classes do HTML original e os componentes Vue propostos.

| HTML original | Componente Vue | Categoria |
|---|---|---|
| `.btn` (`.primary`, `.ghost`, `.danger`, `.warning`, `.icon`) | `<BaseButton variant="primary|ghost|danger|warning" :icon="bool">` | Atom |
| `.kpi` | `<KPIBadge tone="default|ceo|delego|followup" :value :label>` | Atom |
| `.tab-main` (com `.badge`) | `<AppTabsMain>` (organism) | Organism |
| `.search` (input + ícone) | `<BaseInput variant="search" v-model :placeholder>` | Atom |
| `.inbox` | `<TarefaInbox @capture="..."/>` | Molecule |
| `.horizonte` (head + body com drop-zone) | `<TarefaHorizonte :horizonte :tarefas @drop>` | Molecule |
| `.task` (com expand, badges, checklist, anotações, drag) | `<TarefaCard :tarefa @toggle @edit @drop @action>` | Molecule |
| `.badge-tipo`, `.badge-projeto`, `.badge-agenda`, `.badge-followup`, `.badge-delegado`, `.badge-progress`, `.badge-meta` | `<BaseBadge variant="tipo|projeto|agenda|followup|delegado|progress|meta" :tone>` | Atom |
| `.progress-bar` / `.checklist-bar` / `.p-progress` / `.m-progress` / `.pm-bar` | `<BaseProgressBar :value :max :tone="default|zero|full|vencida"/>` | Atom |
| `.checklist-item` + `.checklist-form` | `<TarefaChecklist v-model="checklist"/>` | Molecule |
| `.anotacoes` + `.anotacao` + `.anotacao-form` | `<TarefaAnotacoes v-model="anotacoes"/>` | Molecule |
| `.reagendamentos` | `<TarefaReagendamentos :items/>` | Atom |
| `.minicalendar` | `<AgendaMiniCalendar v-model:offset @selectDay/>` | Molecule |
| `.agenda-legend` | `<AgendaLegend/>` | Atom |
| `.agenda-controls` | `<AgendaControls v-model:offset @hoje/>` | Molecule |
| `.agenda-grid` (head-row, allday-row, ag-body) | `<AgendaGrid3D :offset @select-slot @open-event/>` | Molecule (organismo leve) |
| `.ag-event` | `<AgendaEvent :tarefa :followup :done/>` | Atom |
| `.ag-allday-item` | reusa `<AgendaEvent variant="allday">` | Atom |
| `.tooltip` (`#evt-tooltip`) | `<AgendaTooltip>` controlado via `useTooltip()` | Atom |
| `.pag-mini-resumo` (3 cards) | `<PagamentoMiniResumo :pendente :atrasado :pago/>` | Molecule |
| `.pag-mini-item` | `<PagamentoMiniItem :pagamento/>` | Atom |
| `.pagamento-resumo-card` (resumo cheio) | `<PagamentoResumoCard tone="pendente|atrasado|pago" :label :valor/>` | Atom |
| `.pagamento-card` (linha cheia) | `<PagamentoCard :pagamento @toggle @edit/>` | Molecule |
| `.projeto-card.expandable` | `<ProjetoCardExpandable :projeto :ctx-meta-id @toggle @add-tarefa @edit @delete/>` | Molecule |
| `.projeto-card .p-quick-add` | `<ProjetoQuickAdd @add :projeto-id/>` | Atom |
| `.projeto-grupo` (h3 + cards) | `<ProjetoGrupo :categoria :projetos/>` | Molecule |
| `.meta-card` | `<MetaCardExpandable :meta @toggle @add-tarefa @edit @arquivar @deletar/>` | Molecule |
| `.meta-card .m-quick-add` | `<MetaQuickAdd :meta-id @add/>` | Atom |
| `.pm-section` + `.pm-mini-card` | `<PMSection :titulo :slots> + <PMMiniCard :item type="projeto|meta"/>` | Molecule |
| `.nota` | `<NotaCard :nota @toggle @edit @arquivar @deletar/>` | Molecule |
| `.notas-completo` (grid responsivo) | layout direto na page (`grid auto-fill minmax(280px,1fr)`) | — |
| `.notas-filtros` / `.projetos-filtros` / `.arquivo-filtros` / `.pagamentos-filtros` | `<BaseFilterPills :options v-model:active/>` | Atom |
| `.arquivo-item` | `<ArquivoItem :item @abrir @restaurar @deletar/>` | Molecule |
| `.modal-backdrop` + `.modal` | `<AppModal :open :title :size :destructive-actions> <slot/> <slot name="actions"/>` | Organism |
| `.modal-tarefa` | `<ModalTarefa v-model:open :tarefa :defaults/>` | Organism (compõe AppModal) |
| `.modal-nota` | `<ModalNota v-model:open :nota/>` | Organism |
| `.modal-projeto` | `<ModalProjeto v-model:open :projeto/>` | Organism |
| `.modal-meta` | `<ModalMeta v-model:open :meta/>` | Organism |
| `.modal-pagamento` | `<ModalPagamento v-model:open :pagamento/>` | Organism |
| `.modal-confirm` | `<ModalConfirm/>` controlado por `useConfirm()` | Organism |
| `.toast` | `<AppToast/>` controlado por `useToast()` | Organism |
| `.empty-state` (com `.big`) | `<BaseEmptyState :icon :message/>` | Atom |
| `.field`, `.field-row`, `.field-row-3`, `.warning-box`, `.followup-section` | `<BaseField :label :hint>`, `<BaseFieldRow :cols=2|3>`, `<BaseWarning>`, `<TarefaFollowupSection/>` | Atom/Molecule |
| `.mobile-tabs` (fixed bottom) | `<AppMobileTabs/>` | Organism |
| `.topbar` | `<AppTopbar>` | Organism |

---

## 6. Componentes base (Atoms)

### 6.1 `BaseButton`

**Props**:
```ts
interface Props {
  variant?: 'primary' | 'ghost' | 'danger' | 'warning';
  size?: 'md' | 'sm' | 'icon';      // icon = 28x28 redondo
  type?: 'button' | 'submit';
  disabled?: boolean;
  loading?: boolean;
  iconLeft?: string;                 // Lucide name
  iconRight?: string;
}
```

**Slots**: default (label).

**Specs visuais** (todos compartilham `padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; transition: background 150ms, transform 100ms; gap: 6px;`):

| variant | bg | color | border | hover bg |
|---|---|---|---|---|
| `primary` | `--color-accent` | `#fff` | none | `--color-accent-hover` |
| `ghost` | `--color-surface` | `--color-text` | `1px var(--color-border-strong)` | `--color-surface-hover` |
| `danger` | transparent | `--color-danger` | `1px var(--color-danger)` | `#fdebec` |
| `warning` | transparent | `--color-warning` | `1px var(--color-warning)` | `#fef3e6` |

`:active { transform: scale(0.97); }` em todas.

**Variante `icon`** (`size="icon"`): 28×28, `border-radius: 50%`, padding: 0, justify-center. Para `.btn.icon`.

Mini-button (em `.pm-mini-btn`, `.modal-close`): 22×22 / 28×28 — usar `<BaseButton size="icon">` com `:size` adicional ou um `BaseIconButton` se for cleaner. **Decisão**: criar variante `size="icon-sm" (22px)` e `size="icon-md" (28px)`.

### 6.2 `BaseBadge`

Engloba todas as badges do produto. Props:

```ts
interface Props {
  variant: 'tipo' | 'projeto' | 'agenda' | 'followup' | 'delegado' | 'progress' | 'meta' | 'count' | 'kind';
  tone?:
    | 'ceo' | 'delego' | 'pessoal'             // tipo
    | 'empresa' | 'produto' | 'geral' | 'pessoal' // projeto
    | string;
  icon?: string;                                 // sobrepõe o ::before do original
}
```

**Mapeamento** (espelha o CSS original):

| variant | bg | color | radius | font | extras |
|---|---|---|---|---|---|
| `tipo`/ceo | `--color-ceo-bg` | `--color-ceo-fg` | 10px | 10px/600 uppercase ls=0.03em | — |
| `tipo`/delego | `--color-delego-bg` | `--color-delego-fg` | 10px | idem | — |
| `tipo`/pessoal | `--color-pessoal-bg` | `--color-pessoal-fg` | 10px | idem | — |
| `delegado` | `--color-delego-bg` | `--color-delego-fg` | 10px | 10px/500 | prefixo `→ ` opacity 0.7 |
| `projeto`/empresa | `--color-proj-empresa-bg` | `--color-proj-empresa-fg` | 4px | 10px/500 | border 1px do bd; max-w 140px ellipsis |
| `projeto`/produto | green stack | idem | idem | idem | idem |
| `projeto`/geral | yellow stack | idem | idem | idem | idem |
| `projeto`/pessoal | pink stack | idem | idem | idem | idem |
| `agenda` | `--color-accent-soft` | `--color-accent` | 10px | 10px/600 tabular | — |
| `followup` | `--color-followup-bg` | `--color-followup-fg` | 10px | 10px/600 | prefix `<Icon name="hourglass">` |
| `progress` | `--color-surface-alt` | `--color-text-2` | 10px | 10px/600 tabular | border 1px |
| `meta` | `rgba(10,132,255,.12)` | `#0a84ff` | 4px | 10px/500 | prefix dot ◎ → `<Icon name="target">` |
| `count` (em `.tab-main` e `.horizonte-head`) | `--color-surface-hover` | `--color-text-2` | 8px / pill | 10px tabular | quando `active`: `--color-accent-soft` / `--color-accent` |
| `kind` (`.a-kind` em arquivo) | `--color-surface-alt` | `--color-text-3` | 4px | 10px/600 uppercase ls=0.05em | — |

### 6.3 `BaseInput` / `BaseTextarea` / `BaseSelect`

```ts
interface InputProps {
  modelValue: string | number;
  variant?: 'default' | 'search' | 'flat';   // flat = input dentro de cards (inbox-form, quick-add)
  type?: 'text' | 'date' | 'time' | 'number' | 'email';
  placeholder?: string;
  list?: string;                              // datalist
  inputmode?: string;
  autofocus?: boolean;
  step?: string;
  min?: string | number;
}
```

**Specs** (default):
```
background: var(--color-surface);
border: 1px solid var(--color-border-strong);
border-radius: 6px;
padding: 8px 10px;
font-size: 14px;
transition: border-color 150ms, box-shadow 150ms;

:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(0,113,227,0.12);
  outline: none;
}
```

**Variant `search`**: padding-left 30px, ícone search dentro (slot `prefix`), font-size 13px, padding 6px 10px 6px 30px.

**Variant `flat`** (inbox / quick-add interno de cards): bg `--color-surface-alt` (quando dentro de `.inbox`) ou `transparent` (quando dentro de `.p-quick-add`/`.m-quick-add`); sem border (border do container). Foco usa só o ring do container.

**`<BaseTextarea>`**: mesmo, com `resize: vertical; min-height: 80px;`.

**`<BaseSelect>`**: mesmo, suporta `<optgroup>` (renderProjetosSelect agrupa por categoria).

### 6.4 `BaseToggle` (switch iOS-style)

Para `.followup-section .tog`.

```html
<BaseToggle v-model="ativo" :label="..." :sub="..." :tone="warning|accent"/>
```

Visual:
- Track `36×20`, `border-radius: 10px`, bg `--color-border-strong` (off) → `--color-warning` (on, `tone="warning"`).
- Knob `16×16`, `border-radius: 50%`, `box-shadow: 0 1px 3px rgba(0,0,0,0.15)`, `top: 2px`, transição `transform 150ms`. On: `translateX(16px)`.
- A esquerda/direita: ícone/label/sub-label opcional.

### 6.5 `BaseCheckbox` (redonda — tarefa)

Para `.task .check`.

- 18×18, `border-radius: 50%`, `border: 1.5px solid var(--color-border-strong)`.
- Hover: `border-color: var(--color-accent)`.
- Done: `background: var(--color-success); border-color: var(--color-success);`. Renderizar checkmark com pseudo (`::after { width:9px;height:5px;border:1.5px solid #fff;border-top:0;border-right:0;transform:rotate(-45deg) translate(1px,-1px) }`).

`v-model:checked`, evento `@toggle`.

### 6.6 `BaseCheckboxSquare` (checklist)

Para `.checklist-item .ci-check`.

- 14×14, `border-radius: 3px`, mesmas cores/comportamento.
- Strike-through no texto irmão quando `done`.

### 6.7 `BaseProgressBar`

```ts
interface Props {
  value: number;        // 0..100
  height?: 3 | 4 | 6;   // 3 = task/projeto/meta; 4 = m-proj-bar; 6 = checklist
  tone?: 'default' | 'zero' | 'full' | 'vencida' | 'meta';
  gradient?: boolean;   // projeto/meta: true; checklist/task: false (cor sólida success)
}
```

Visuais:
- `height=3`, gradient sólido `--color-success`. Track: `--color-border` (task) ou `--color-surface-alt` (projeto/meta).
- `tone="zero"`: `bg: --color-border-strong`, fill 100% (rail), opacity 0.3 (no caso projeto/meta).
- `tone="full"`: gradient `--color-progresso-full-from → to`.
- `tone="vencida"`: gradient `--color-meta-vencida-from → to`.
- `tone="meta"`: gradient `--color-meta-from → to`.
- transição `width 250–300ms ease`.

### 6.8 `BaseFilterPills`

Substitui `.notas-filtros`, `.projetos-filtros`, `.arquivo-filtros`, `.pagamentos-filtros`, `.metas-filtros`.

```html
<BaseFilterPills
  v-model="state.ui.filtro_nota"
  :options="[{ value: 'todos', label: 'Todos' }, { value: 'Playbook', label: 'Playbook' }]"
/>
```

Pill:
- `padding: 4px 10px`, `font-size: 11px`, `border-radius: 12px`, border 1px `--color-border`.
- `bg: --color-surface`, `color: --color-text-2`, hover `--color-surface-hover`.
- **Active**: `background: var(--color-text); color: #fff; border-color: var(--color-text);`.

### 6.9 `BaseEmptyState`

```html
<BaseEmptyState icon="dollar" message="Nenhum pagamento próximo." />
```

- `text-align: center; padding: 50px 20px; color: var(--color-text-3); font-size: 13px;`
- `icon`: 32px, opacity 0.5, margin-bottom 8px. Símbolos do original (`$`, `✦`, `◎`, `⊙`) viram ícones SVG (`dollar-sign`, `sparkle`, `target`, `archive`).

### 6.10 `BaseField`

```html
<BaseField label="Título" hint="Texto de ajuda" :required="false">
  <BaseInput v-model="..."/>
</BaseField>
```

- label: 11px / 600 / uppercase / ls=0.05em / color `--color-text-3` / margin-bottom 5px.
- hint: 11px / color `--color-text-3` / margin-top 4px.

`<BaseFieldRow :cols="2|3">` aplica `display: grid; grid-template-columns: repeat(N,1fr); gap: 12px;`.

### 6.11 `BaseTooltip` / `useTooltip()`

Tooltip global posicionado em `position: fixed` (não dentro do flow). Implementar como singleton via composable:

```ts
const { show, hide, bindHover } = useTooltip();
// no AgendaEvent:
const el = ref<HTMLElement>();
onMounted(() => bindHover(el.value!, () => ({
  variant: tarefa.followup?.ativo ? 'fup' : 'normal',
  time: timeStr,
  titulo: tarefa.titulo,
  desc: tarefa.descricao,
  chips: [...]
})));
```

Visual da tooltip (do original):
- `background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: 10px; box-shadow: var(--shadow-lg); padding: 12px 14px; max-width: 320px; min-width: 200px; z-index: 1000; pointer-events: none;`
- `tt-time`: 10px / 600 / mono / uppercase / ls=0.04em / cor accent (warning quando fup).
- `tt-titulo`: 14px / 600 / lh 1.3.
- `tt-desc`: 12px / cor `--color-text-2` / lh 1.55 / max-height 120px overflow hidden / pre-wrap.
- `tt-meta`: chips no rodapé com border-top hairline.
- `tt-hint`: "Clique para editar" italic 10px cor `--color-text-4`.
- delay show: 150ms; opacity 0 → 1 em 120ms; segue mouse com posicionamento auto-flip nas bordas.

### 6.12 `BaseIcon`

Wrapper sobre **Lucide** (preferido) ou **Heroicons**. Substitua TODOS os ícones-emoji do original:

| Origem | Lucide |
|---|---|
| `✕` (close) | `x` |
| `‹` `›` (mini-cal nav) | `chevron-left` / `chevron-right` |
| `▾` (chevron expand) | `chevron-down` |
| `⏳` (followup) | `hourglass` |
| `→` (delegado) | `arrow-right` |
| `↩` (desvincular) | `corner-up-left` |
| `◎` (meta) | `target` |
| `✦` (notas empty) | `sparkle` |
| `$` (pag empty) | `dollar-sign` |
| `⊙` (arquivo empty) | `archive` |
| ícone search topbar | `search` |
| ícone `+` (novo) | `plus` |

**Regra**: nunca emoji. Sempre SVG via `<BaseIcon name="..." :size="14|16|18"/>`.

---

## 7. Componentes compostos (Molecules)

### 7.1 `KPIBadge`

```html
<KPIBadge tone="ceo" :value="kpis.ceo" label="CEO" />
```

- container: `padding: 5px 11px; bg: --color-surface; border: 1px var(--color-border); border-radius: 6px; flex-direction: column;`
- `.k-val`: 15px / 600 / lh 1.1 / tabular. Cor por tone:
  - default `--color-text`
  - ceo `--color-ceo-fg`
  - delego `--color-delego-fg`
  - followup `--color-followup-fg`
- `.k-lab`: 10px / 500 / uppercase / ls=0.05em / cor `--color-text-3`.

KPIs renderizados pela topbar: `Ativas, CEO, Delego, Core 30, Follow-up, Hoje`.

### 7.2 `TarefaInbox`

Caixa "Inbox · captura rápida" no topo do painel Tarefas.

```html
<TarefaInbox @capture="(titulo) => store.criarTarefaRapida(titulo)" />
```

- container: `bg: --color-surface; border: 1px var(--color-border); border-radius: 14px; padding: 10px 12px; margin-bottom: 18px;`
- header: 11px/600/uppercase/ls=0.05em/`--color-text-3`/margin-bottom 8px → "Inbox · captura rápida".
- input: variant `flat`, `bg: --color-surface-alt; border: 1px --color-border;` que vira `--color-surface` no foco.
- Enter cria tarefa default: `horizonte: 'core30'`, `tipo: 'CEO'`.

### 7.3 `TarefaHorizonte`

Container de drop para tarefas dentro de um horizonte.

```html
<TarefaHorizonte
  :horizonte="HORIZONTES.core30"
  :tarefas="tarefasFiltradas"
  @drop="(tarefaId) => store.moverHorizonte(tarefaId, 'core30')"
/>
```

**Estrutura visual**:
```
.horizonte
├─ .horizonte-head    (sticky de listras coloridas no left::before, label, count, desc)
└─ .horizonte-body    (drop zone; "Vazio. Arraste tarefas aqui." quando vazio)
```

- `border-radius: 14px`, `border: 1px var(--color-border)`, `overflow: hidden`, `margin-bottom: 18px`.
- head: bg `--color-surface-alt`, border-bottom hairline, padding `10px 14px`, label 13px/600.
  - **listra colorida** à esquerda (3px width) usando `--color-h-{id}` via pseudo-elemento ou `::before`. **No Vue, usar `:style="{ '--bar': color }"`** ou `data-h="core30"` igual o original.
- count: 11px tabular, `padding: 2px 8px; border-radius: 10px; bg: --color-surface; border: 1px var(--color-border);`.
- desc: 11px `--color-text-3` à direita.
- body: `padding: 6px; gap: 2px; flex-direction: column; min-height: 30px;`.
- empty pseudo: "Vazio. Arraste tarefas aqui." — italic 12px `--color-text-4`.
- **drop-hover**: aplica `box-shadow: 0 0 0 2px var(--color-accent);` enquanto está sendo recebido.

**Constante `HORIZONTES`** (arquivo `composables/useHorizontes.ts`):
```ts
export const HORIZONTES = [
  { id: 'core30', label: 'Core 30 dias', desc: 'Próximas 4 semanas', color: 'var(--color-h-core30)' },
  { id: 'core60', label: 'Core 60 dias', desc: '2 meses', color: 'var(--color-h-core60)' },
  { id: 'core90', label: 'Core 90 dias', desc: '3 meses', color: 'var(--color-h-core90)' },
  { id: 'micro',  label: 'Micro',         desc: 'Até 30 min · batelada', color: 'var(--color-h-micro)' },
  { id: 'backlog',label: 'Backlog',       desc: 'Depois do trimestre',   color: 'var(--color-h-backlog)' },
  { id: 'hibernando', label: 'Hibernando', desc: 'Sem operador',         color: 'var(--color-h-hibernando)' },
] as const;
```

### 7.4 `TarefaCard`

O **componente mais complexo** do app. Espelha exatamente `.task` + `.task-expand`.

```ts
interface Props {
  tarefa: Tarefa;
  draggable?: boolean;        // default true
  context?: 'horizonte' | 'projeto' | 'meta';
}

interface Emits {
  (e: 'toggle-done'): void;
  (e: 'edit'): void;
  (e: 'desagendar'): void;
  (e: 'arquivar'): void;
  (e: 'deletar'): void;
  (e: 'add-checklist', texto: string): void;
  (e: 'toggle-checklist', id: string): void;
  (e: 'remove-checklist', id: string): void;
  (e: 'add-anotacao', texto: string): void;
  (e: 'remove-anotacao', id: string): void;
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
}
```

**Estrutura**:
```vue
<div class="task" :class="{ done, expanded, dragging }" draggable="true">
  <div class="task-main">
    <BaseCheckbox :checked="tarefa.done" @toggle="$emit('toggle-done')" />
    <div class="task-titulo">{{ tarefa.titulo }}</div>
    <div class="task-badges">
      <!-- ordem do original:
        1. badge-followup (se followup ativo) OU badge-agenda (se data)
        2. badge-progress (se checklist)
        3. badge-delegado (se tipo=Delego e delegado_para)
        4. badge-projeto (se projeto_id)
        5. badge-meta (se meta_id)
        6. badge-tipo (sempre, último)
      -->
    </div>
  </div>

  <BaseProgressBar v-if="checklist.length > 0" :value="pct" :tone="pct === 0 ? 'zero' : 'default'" :height="3"/>

  <Transition name="expand">
    <div v-if="expanded" class="task-expand">
      <div class="task-desc">{{ tarefa.descricao || 'Sem descrição.' }}</div>
      <TarefaReagendamentos v-if="tarefa.reagendamentos?.length" :items="tarefa.reagendamentos"/>

      <div class="task-actions">
        <BaseButton variant="primary" size="sm" @click="$emit('edit')">Editar</BaseButton>
        <BaseButton v-if="hasAgenda" variant="ghost" size="sm" @click="$emit('desagendar')">Tirar da agenda</BaseButton>
        <BaseButton variant="warning" size="sm" @click="$emit('arquivar')">Arquivar</BaseButton>
        <BaseButton variant="danger" size="sm" @click="$emit('deletar')">Deletar</BaseButton>
      </div>

      <TarefaChecklist v-model="tarefa.checklist" />
      <TarefaAnotacoes v-model="tarefa.anotacoes" />
    </div>
  </Transition>
</div>
```

**Specs visuais**:
- container: `bg: --color-surface; padding: 10px 12px; border-radius: 6px; border: 1px solid transparent;`
- hover: `bg: --color-surface-hover; border-color: --color-border;`.
- `.expanded`: idem hover + descer painel.
- `.dragging`: `opacity: 0.4; cursor: grabbing;`.
- `.done .task-titulo`: `text-decoration: line-through; color: --color-text-3;`.
- `task-main`: flex/center/gap 10px.
- `task-titulo`: 13px/500/`--ls-body`, ellipsis (`overflow:hidden;text-overflow:ellipsis;white-space:nowrap`), `flex: 1; min-width: 0;`.
- `task-badges`: flex/gap 5px/items center/wrap/max-w 55%/justify-end.
- `task-action` (botões dentro do expand): override de BaseButton com `font-size: 12px; padding: 5px 10px; border-radius: 6px;` — passar prop `size="sm"`.
- `task-actions`: `display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;`.
- `task-expand`: `margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border);`.
- `task-desc`: 13px/`--color-text-2`/lh 1.55/pre-wrap/margin-bottom 12px. Empty → italic.

**Regras de clique** (já implementadas no original; respeitar):
- Click em `.task-badges` **não expande**.
- Click em forms (checklist/anotação) **não expande**.
- Click em items da checklist **não expande**.
- Outras áreas → toggle expand.

**Drag & drop**:
- `@dragstart`: `setData('text/plain', tarefa.id)`, adicionar classe dragging.
- `@dragend`: remover classe.
- Drop é gerenciado pelo `<TarefaHorizonte>`.

### 7.5 `TarefaChecklist`

```html
<TarefaChecklist v-model="tarefa.checklist" />
```

- Header com `<TarefaChecklistHeader>` (count + pct).
- `<BaseProgressBar :height="6">` quando há itens.
- Lista de itens com `<BaseCheckboxSquare>`, texto e `<BaseIcon name="x">` para remover (visível só on hover do item).
- Form de adicionar (input flat, Enter cria item).

Specs do header:
```css
.checklist-section { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--color-border); }
.checklist-head {
  font-size: 11px; color: var(--color-text-3);
  text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;
  margin-bottom: 8px; display: flex; justify-content: space-between;
}
.checklist-head .pct { font-family: var(--font-mono); font-weight: 700; color: var(--color-success); }
.checklist-head .pct.zero { color: var(--color-text-4); }
```

Item:
- `display: flex; align-items: flex-start; gap: 8px; padding: 5px 0; font-size: 12px; line-height: 1.4;`
- check 14×14 (radius 4px — `--radius-xs`; era 3px antes de a escala ser fechada, ver `design-system/MASTER.md` §2)
- `:hover .ci-del { opacity: 1; }` — botão de delete fade-in.

### 7.6 `TarefaAnotacoes`

```html
<TarefaAnotacoes v-model="tarefa.anotacoes" />
```

- Header "Anotações da tarefa" (mesmo estilo do checklist-head).
- Cada anotação:
  - card: `bg: --color-surface; border: 1px var(--color-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 5px;`
  - meta (timestamp): `font-mono` 10px `--color-text-3`, formato `dd/mm hh:mm` (`fmtNowStamp`).
  - corpo: 12px / `--color-text-2` / pre-wrap / lh 1.5.
  - delete `<Icon name="x">` 14px, opacity 0 → 1 on hover; cor → danger no hover do botão.
- Form: input flat para adicionar, Enter dispara `add`.

### 7.7 `AgendaMiniCalendar`

```html
<AgendaMiniCalendar v-model:monthOffset="ui.mc_month_offset" :janela3dStart @selectDay/>
```

Estrutura:
```
.minicalendar
├─ .mc-head (◀ mês ano ▶)
├─ .mc-grid (7 cols × 6 rows = 42 dias + 7 DOW headers)
└─ .mc-goto-today
```

Specs:
- container: `bg: --color-surface; border: 1px var(--color-border); border-radius: 10px; padding: 10px;`
- `.mc-head`: flex space-between; mês 12px/600 capitalize.
- nav buttons: 22×22 round, hover bg `--color-surface-hover`.
- `.mc-grid`: `grid-template-columns: repeat(7,1fr); gap: 1px;`
- `.mc-dow`: 9px/600/uppercase/ls=0.05em/cor `--color-text-4`/text-align center.
- `.mc-dia`:
  - 11px tabular center, padding `5px 0`, radius 4px, transição bg.
  - `.outro-mes`: cor `--color-text-4`.
  - `.hoje`: bg `--color-accent`, color `#fff`, weight 600.
  - `.janela-ativa` (dentro do range 3d atual): bg `--color-accent-soft`, color `--color-accent`. Quando `hoje + janela-ativa`: prevalece `hoje`.
  - `.tem-evento::after`: dot 4×4 absoluto bottom 2px center, cor `--color-accent`.
  - `.tem-fup::after`: cor `--color-warning`.
- click no dia → emite `selectDay(dateStr)` → no consumidor, calcula `agenda_3d_offset = floor((d - hoje)/3)`.
- "voltar para hoje": 10px / cor `--color-accent` / hover bg `--color-accent-soft`.

### 7.8 `AgendaGrid3D`

A peça mais densa. Renderiza:
1. Header row (3 dias)
2. All-day row (3 colunas com items)
3. Body com 24 horas × 3 colunas, eventos absolute-positioned.

```ts
interface Props {
  offset3d: number;            // -∞..+∞ (cada incremento = 3 dias)
  tarefas: Tarefa[];           // já filtradas (não-arquivadas)
}
interface Emits {
  (e: 'select-slot', payload: { data: string; hora?: string }): void;
  (e: 'open-event', tarefa: Tarefa): void;
}
```

**Estrutura visual exata** (do original):

```css
.agenda-grid {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  display: flex; flex-direction: column;
}
.ag-head-row {
  display: grid;
  grid-template-columns: 44px repeat(3, 1fr);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  position: sticky; top: 0; z-index: 2;
}
.ag-head-cell { padding: 8px 4px 6px; text-align: center; border-left: 1px solid var(--color-border); ... }
.ag-head-cell .dow { font-size: 10px; }
.ag-head-cell .dnum { font-size: 18px; font-weight: 700; tabular; }
.ag-head-cell.today { background: var(--color-accent-soft); }
.ag-head-cell.today .dnum { color: var(--color-accent); }
```

Body:
```css
.ag-body { overflow-y: auto; max-height: 720px; position: relative; }
.ag-grid-body { display: grid; grid-template-columns: 44px repeat(3, 1fr); position: relative; }
.ag-hours-col { display: flex; flex-direction: column; border-right: 1px solid var(--color-border); }
.ag-hour-label {
  height: 48px; padding: 0 6px; text-align: right;
  font-size: 10px; tabular; color: var(--color-text-3);
  border-bottom: 1px solid var(--color-border);
  position: relative; top: -6px;     /* truque para alinhar a label NA linha da hora */
}
.ag-day-col { border-left: 1px solid var(--color-border); position: relative; min-height: 1152px; /* 24*48 */ }
.ag-day-col.today { background: rgba(0,113,227,0.02); }
.ag-hour-slot { height: 48px; border-bottom: 1px solid var(--color-border); cursor: pointer; }
.ag-hour-slot:hover { background: var(--color-surface-hover); }
```

Allday row (sticky abaixo do header):
```css
.ag-allday-row {
  display: grid; grid-template-columns: 44px repeat(3, 1fr);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  min-height: 30px; position: sticky; top: 52px; z-index: 1;
}
.ag-allday-label { font-size: 9px; color: var(--color-text-4); uppercase; ls=0.05em; padding: 8px 4px 0; text-align: right; border-right: 1px var(--color-border); }
.ag-allday-cell { padding: 4px 3px; border-left: 1px var(--color-border); display: flex; flex-direction: column; gap: 3px; }
```

Eventos (com hora):
```css
.ag-event {
  position: absolute;
  left: 3px; right: 3px;
  background: var(--color-accent);
  color: #fff;
  border-radius: 5px;
  padding: 5px 7px;
  font-size: 11px; font-weight: 500;
  cursor: pointer;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: filter 100ms, box-shadow 100ms;
  z-index: 1;
}
.ag-event:hover { filter: brightness(1.06); box-shadow: var(--shadow-md); z-index: 3; }
.ag-event.fup { background: var(--color-warning); }
.ag-event.done { opacity: 0.5; text-decoration: line-through; }
.evt-time { font-mono; font-size: 10px; opacity: 0.9; display: block; }
.evt-titulo { font-weight: 600; line-height: 1.2; -webkit-line-clamp: 2; }
```

Allday item:
```css
.ag-allday-item {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border-left: 2px solid var(--color-accent);
  padding: 3px 6px; font-size: 11px; border-radius: 3px;
  font-weight: 500; ellipsis;
}
.ag-allday-item.fup {
  background: var(--color-followup-bg);
  color: var(--color-followup-fg);
  border-left-color: var(--color-warning);
}
```

**Posicionamento dos eventos**:
```ts
const top = (startMin / 60) * 48;
const height = Math.max(28, (durMin / 60) * 48);
```

**Auto-scroll** ao montar para 7h: `setTimeout(() => body.scrollTop = 7 * 48, 0)`.

**Click handlers**:
- Click em hour-slot → `emit('select-slot', { data, hora: 'HH:00' })`.
- Click em head-cell (não primeira) → `emit('select-slot', { data })`.
- Click em event/allday → `emit('open-event', tarefa)` (com `e.stopPropagation()`).

**Tooltip**: usar `useTooltip()` em cada `<AgendaEvent>` (ver §6.11).

### 7.9 `AgendaControls`

Linha com `« hoje »` e label do range.

```html
<AgendaControls
  v-model:offset="ui.agenda_3d_offset"
  :periodo="`${fmtBRDate(start)} – ${fmtBRDate(end)}`"
/>
```

Specs (igual `.agenda-controls`):
- flex space-between, font-size 12px, margin-bottom 10px.
- `.semana-label`: 600 / `--color-text` / tabular.
- `.semana-nav button`: min-w 24, h 24, radius 50%, color `--color-text-2`, hover bg `--color-surface-hover`.
- `.hoje-btn`: pill (radius 12px, padding 0 10px, font-size 10px).

### 7.10 `AgendaLegend`

```html
<AgendaLegend />
```

Tags fixas:
```
[●] Agenda    [●] Follow-up
```

Specs:
- container: `display: flex; gap: 12px; font-size: 10px; color: var(--color-text-3); margin-bottom: 10px; padding: 8px 10px; bg: var(--color-surface); border: 1px var(--color-border); border-radius: 6px;`
- dot 10×10 radius 3px:
  - `.normal` → `--color-accent`
  - `.fup` → `--color-warning`

### 7.11 `PagamentoMiniResumo` + `PagamentoMiniItem`

Resumo (3 cards iguais):
- grid 3 cols, gap 6, margin-bottom 12.
- card: `bg: --color-surface; border: 1px var(--color-border); border-radius: 6px; padding: 8px 10px; text-align: center;`
- label: 9px/600/uppercase/ls=0.05em/`--color-text-3`.
- valor: `font-mono`, 12px/700/tabular/lh 1.1, cor por tone (amber/delego-fg/danger).

Item (linha compacta):
- `display: grid; grid-template-columns: 8px 1fr auto; gap: 8px; padding: 8px 10px; border-radius: 6px;`
- dot 8×8 colorido por status (`pendente`=amber, `atrasado`=danger, `pago`=success).
- desc 12px/500 ellipsis + sub date 10px/mono/`--color-text-3`.
- valor mono 12px/600 tabular.
- `.pago`: `opacity: 0.5; .desc { line-through }`.

### 7.12 `PagamentoCard` (linha completa)

Exibido na view `/pagamentos`.

```html
<PagamentoCard :pagamento @toggle @edit/>
```

Grid 6 colunas: `16px 1fr auto auto auto auto`.
- `.p-status-dot`: 10×10 redondo. Atrasado tem `animation: pulse 2s infinite`.
- `.p-desc`: 14px/500 + sub `.p-notas` 11px `--color-text-3` truncado em 80 chars.
- `.p-valor`: mono 14px/600 tabular text-right.
- `.p-data`: mono 12px `--color-text-3`. `.atrasado .p-data`: cor danger / 600.
- `.p-status-label` (badge): 10px/600/uppercase/ls=0.05em radius 4px:
  - pendente → amber-bg / amber.
  - pago → `#e8f5ed` / delego-fg.
  - atrasado → `#fdebec` / danger.
- `.p-actions`: dois botões `Pagar`/`Desmarcar`, `Editar`. Usar `<BaseButton size="sm">` ou um `.p-action` dedicado:
  - 11px / padding 3px 8px / radius 6px / border 1px `--color-border-strong` / bg `--color-surface` / cor `--color-text-2`.
  - hover `bg: --color-surface-hover`.
  - `.danger`: hover `color: --color-danger; border-color: --color-danger;`.

### 7.13 `ProjetoCardExpandable`

Card colapsável de projeto. Estrutura:

```
.projeto-card.expandable
├─ .p-head (clicável, toggle expand)
│  ├─ .dot (cor por categoria)
│  ├─ .p-titulo + .p-parent (parent label se for produto vinculado)
│  ├─ .p-stats
│  ├─ .p-pct
│  └─ .p-chevron (rotaciona 180° quando .open)
├─ .p-progress (3px gradient)
└─ .p-body (visível só quando .open)
   ├─ .p-tarefas-lista (TarefaCard's)
   ├─ .p-quick-add (input + "+ Tarefa completa")
   └─ .p-footer (Editar / Deletar / Desvincular se contextoMetaId)
```

Specs visuais:
- container: `bg: --color-surface; border: 1px var(--color-border); border-radius: 10px; padding: 0; overflow: hidden;`
- `.p-head`: `display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer;`
- `.p-head:hover`: `bg: --color-surface-hover`.
- `.dot`: 10×10 redondo. Cor por categoria:
  - empresa → `#4338ca`
  - produto → `#15803d`
  - geral → `#854d0e`
  - pessoal → `#9d174d`
  *(usar tokens `--color-proj-{cat}-fg`)*
- `.p-titulo`: flex 1 / 14px / 500.
- `.p-parent`: 11px / 400 / `--color-text-3` / margin-left 6px (mostra `· EmpresaPai` quando produto).
- `.p-stats`: 11px / `--color-text-3` / tabular (`5/12 feitas · 3 notas`).
- `.p-pct`: 12px / 600 / `--color-text-2` / tabular / min-width 36px text-right.
- `.p-chevron`: 11px / `--color-text-4` / `transition: transform 200ms`. `.open` → `rotate(180deg)`.
- `.p-progress`: height 3px / bg `--color-surface-alt`. Fill gradient `--color-progresso-from → to`. `.zero` rail neutro 30% opacity. `.full` gradient azul iOS.
- `.p-body`: `padding: 8px 14px 14px; border-top: 1px var(--color-border); bg: --color-surface-alt;`
- `.p-quick-add`: `display: flex; gap: 6px; bg: --color-bg; border: 1px var(--color-border); border-radius: 8px; padding: 4px 6px 4px 10px;`
  - input flat 13px sem border.
  - botão `<BaseButton variant="ghost" size="sm">+ Tarefa completa</BaseButton>` mas com radius 6px e font-size 11px.
- `.p-footer`: flex justify-end gap 6 / padding-top 6 / border-top hairline / margin-top 6.
- `.produto-sub` (produto exibido sob empresa pai): `margin-left: 24px; padding: 8px 12px; bg: --color-surface-alt;` (densidade reduzida).

**Sub-categoria visual (badges-projeto coloridas)** já definida em §6.2.

### 7.14 `MetaCardExpandable`

Idêntico ao ProjetoCard mas com tons azuis (iOS) e seções específicas.

```
.meta-card
├─ .m-head (m-dot + m-titulo + m-prazo + m-pct + m-chevron)
├─ .m-progress (3px gradient azul/vermelho/verde)
└─ .m-body
   ├─ .m-stats-line   ("5/12 ações concluídas · 3/8 tarefas diretas · 2/4 projetos")
   ├─ .m-desc         (descrição da meta, se houver)
   ├─ Section "Projetos vinculados"
   │  ├─ .m-help-line (tip cinza com border-left)
   │  └─ .m-projetos-vinc-cards  (renderiza ProjetoCardExpandable's com :ctx-meta-id)
   ├─ Section "Tarefas diretas da meta"
   │  ├─ .m-help-line
   │  └─ .m-tarefas-lista (TarefaCard's diretos)
   ├─ .m-quick-add
   └─ .m-footer (Editar meta / Arquivar / Deletar)
```

Specs:
- `.m-dot`: 10×10 redondo. Default `#0a84ff`. `.vencida` → `#ff453a`. `.concluida` → `#34c759`.
- `.m-prazo`: 11px / `--color-text-3` / tabular. `.vencida` → cor danger / 500.
- `.m-progress-fill`: gradient `--color-meta-from → to`. `.zero` rail. `.full` gradient verde. `.vencida` gradient vermelho.
- `.m-body`: `bg: --color-surface-alt; padding: 10px 14px 14px;`
- `.m-section-h`: 11px/600/uppercase/ls=0.06em/`--color-text-3`/margin "10px 0 6px".
- `.m-help-line`: 11px / `--color-text-3` / lh 1.45 / padding `8px 10px` / `bg: --color-bg` / `border-left: 2px solid --color-border-strong` / `border-radius: 0 6px 6px 0` / `b` em peso 600 / cor `--color-text-2`.
- `.m-stats-line`: 11px / `--color-text-3` / tabular / margin-bottom 10px.
- `.m-empty-line`: 12px italic `--color-text-4` padding 6px 0.
- `.m-footer`: idem `.p-footer` do projeto.

### 7.15 `PMSection` + `PMMiniCard`

Painel "Projetos & Metas" no view Trabalho.

`PMSection`:
- header: `display: flex; justify-content: space-between; font-size: 11px; uppercase; ls=0.08em; color: --color-text-3; weight 600; margin-bottom: 8px; padding: 0 2px;`
- botão `+`: `<BaseButton size="icon-sm" variant="ghost">+</BaseButton>` (22×22, radius 6px).

`PMMiniCard`:
- container: `bg: --color-surface; border: 1px var(--color-border); border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer;`
- hover `bg: --color-surface-hover`.
- titulo: 13px/500 com pct à direita 11px/600 tabular.
- bar 3px gradient.
- meta-line: 10.5px / `--color-text-3` / flex space-between / tabular.
  - `pm-prazo.vencida`: cor danger / 500.

Click no card:
- Projeto → `setView('projetos')` + expandir aquele projeto + scrollIntoView smooth/center.
- Meta → idem para `metas`.

### 7.16 `NotaCard`

```html
<NotaCard :nota @toggle @edit @arquivar @deletar/>
```

Estrutura:
```
.nota
├─ .nota-head (clicável, toggle expand)
│  ├─ .nota-dot (cor por tipo)
│  ├─ .nota-titulo (ellipsis)
│  └─ .nota-meta (badge-projeto + nota-tipo label)
└─ .nota-body (visible quando .expanded)
   ├─ .nota-corpo (pre-wrap)
   └─ task-actions (Editar / Arquivar / Deletar)
```

Specs:
- container: `bg: --color-surface; border: 1px var(--color-border); border-radius: 10px; margin-bottom: 8px; overflow: hidden;`
- hover do container: border-color → `--color-border-strong`.
- `.nota-head`: padding `10px 12px`, hover `bg: --color-surface-alt`.
- `.nota-dot`: 8×8 redondo. Cor por `data-t`:
  - Playbook → `--color-nota-playbook`
  - Credencial → `--color-nota-credencial`
  - Contato → `--color-nota-contato`
  - Decisão → `--color-nota-decisao`
  - Referência → `--color-nota-referencia`
- `.nota-titulo`: flex 1, 13px/500, `--ls-body`, ellipsis.
- `.nota-tipo`: 10px / uppercase / ls=0.04em / 500 / `--color-text-3`.
- `.nota-body`: `display: none; padding: 0 12px 12px 12px; border-top: 1px var(--color-border); padding-top: 12px;`. Quando `.expanded`: display block.
- `.nota-corpo`: 13px / `--color-text-2` / lh 1.55 / pre-wrap / margin-bottom 10px.

### 7.17 `ArquivoItem`

Linha do arquivo:
```
[Tarefa] Título do item    arq. 03/05    [Abrir] [Restaurar] [Deletar]
```

- container: `bg: --color-surface; border: 1px var(--color-border); border-radius: 10px; padding: 10px 14px; opacity: 0.85;`
- `.a-kind` (badge "kind"): 10px / uppercase / ls=0.05em / 600 / `bg: --color-surface-alt` / radius 4px / padding 2px 7px.
- `.a-titulo`: 13px / flex 1.
- `.a-meta`: 10px / mono / `--color-text-3`.
- `.a-actions`: `<BaseButton size="sm" variant="ghost|danger">`.

---

## 8. Componentes de layout / overlays (Organisms)

### 8.1 `AppTopbar`

```vue
<header class="topbar">
  <div class="brand">
    <div class="titulo">Comando</div>
    <div class="sub">{{ topbarDate }}</div>
  </div>
  <div class="kpis"> <!-- v-for KPIBadge --> </div>
  <div class="search"> <BaseInput variant="search" v-model="ui.busca" placeholder="Buscar tudo…"/> </div>
  <div class="actions">
    <BaseButton variant="ghost" @click="importJSON">Importar</BaseButton>
    <BaseButton variant="ghost" @click="exportJSON">Exportar</BaseButton>
    <BaseButton variant="primary" @click="openTaskModal()">+ Tarefa</BaseButton>
  </div>
</header>
```

Specs:
- `bg: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px var(--color-border); padding: 10px 20px; display: flex; align-items: center; gap: 14px; z-index: 10;`
- `.brand .titulo`: 15px/600/`--ls-h3`.
- `.brand .sub`: 11px / `--color-text-3` / tabular. Conteúdo formato: `Dom, 4 de maio · 2026`.
- `.kpis`: flex gap 8px, overflow-x auto (mobile: order 3, full width).
- `.search`: flex 1 max-w 340px.
- `.actions`: gap 6px.
- **Sticky horizontal scroll** se KPIs estourarem.

**Atualizar data**: `setInterval(updateTopbarDate, 60000)`. Em Vue: `useIntervalFn(updateTopbarDate, 60000)` do VueUse.

### 8.2 `AppTabsMain`

```vue
<nav class="tabs-main">
  <button v-for="t in TABS" :key="t.view" :class="{ active: ui.view === t.view }" @click="setView(t.view)">
    {{ t.label }}
    <span class="badge">{{ counts[t.view] }}</span>
  </button>
</nav>
```

Specs:
- `bg: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px var(--color-border); padding: 0 20px; display: flex; gap: 0; z-index: 9;`
- tab: `padding: 10px 18px; font-size: 13px; weight 500; color: --color-text-2; border-bottom: 2px solid transparent; transition: all 150ms;`
- hover: cor `--color-text`.
- `.active`: cor `--color-accent`, `border-bottom-color: var(--color-accent)`.
- badge dentro: 10px / `bg: --color-surface-hover` / `color: --color-text-2` / padding 1px 6px / radius 8px / tabular. `.active .badge`: `bg: --color-accent-soft; color: --color-accent`.

**TABS**:
```ts
const TABS = [
  { view: 'trabalho',  label: 'Trabalho',   counter: 'tarefas-ativas' },
  { view: 'agenda',    label: 'Agenda',     counter: 'agenda' },
  { view: 'pagamentos',label: 'Pagamentos', counter: 'pagamentos-abertos' },
  { view: 'projetos',  label: 'Projetos',   counter: 'projetos-ativos' },
  { view: 'metas',     label: 'Metas',      counter: 'metas-ativas' },
  { view: 'notas',     label: 'Notas',      counter: 'notas-ativas' },
  { view: 'arquivo',   label: 'Arquivo',    counter: 'arquivo-total' },
];
```

### 8.3 `AppPanel`

Wrapper para os 5 painéis de `/trabalho`.

```vue
<section class="panel" :class="{ 'active-mobile': isActiveMobile }" :data-panel="key">
  <div class="panel-head">
    <div>
      <h2>{{ titulo }}</h2>
      <div class="sub">{{ sub }}</div>
    </div>
    <slot name="head-action"/>
  </div>
  <div class="panel-body">
    <slot/>
  </div>
</section>
```

Specs:
- `.panel`: `bg: --color-bg; overflow-y: auto; overflow-x: hidden; position: relative;`
- `.panel-head`: `position: sticky; top: 0; bg: rgba(245,245,247,0.92); backdrop-filter: blur(20px) saturate(180%); padding: 12px 16px 10px; border-bottom: 1px var(--color-border); display: flex; justify-content: space-between; gap: 10px; z-index: 5;`
- `.panel-head h2`: 13px/600/`--ls-h-tab`.
- `.panel-head .sub`: 11px / `--color-text-3` / margin-top 1px.
- `.panel-body`: `padding: 12px 16px 40px;`

### 8.4 `AppModal`

```vue
<Teleport to="body">
  <Transition name="modal-backdrop">
    <div v-if="open" class="modal-backdrop show" @click.self="onClose">
      <Transition name="modal">
        <div class="modal" :style="{ maxWidth: maxWidth + 'px' }">
          <div class="modal-head">
            <h3>{{ titulo }}</h3>
            <button class="modal-close" @click="onClose"><BaseIcon name="x"/></button>
          </div>
          <div class="modal-body"><slot/></div>
          <div class="modal-foot"><slot name="actions"/></div>
        </div>
      </Transition>
    </div>
  </Transition>
</Teleport>
```

Specs:
- backdrop: `position: fixed; inset: 0; bg: rgba(0,0,0,0.35); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px;`
- modal: `bg: --color-surface; border-radius: 14px; box-shadow: --shadow-lg; width: 100%; max-width: 560px (default) / 480 / 460 / 440 / 420 conforme contexto; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;`
- modal-head: `padding: 18px 22px 12px; display: flex; justify-content: space-between; border-bottom: 1px var(--color-border);`
- modal-head h3: 16px / 600 / `--ls-h3`.
- modal-close: 28×28 redondo, hover `bg: --color-surface-hover; color: --color-text;`.
- modal-body: `padding: 18px 22px; overflow-y: auto;`
- modal-foot: `padding: 14px 22px; border-top: 1px var(--color-border); display: flex; justify-content: flex-end; gap: 8px; bg: --color-surface-alt; flex-wrap: wrap;`

**Animações**:
```css
.modal-backdrop-enter-active, .modal-backdrop-leave-active { transition: opacity 150ms; }
.modal-backdrop-enter-from, .modal-backdrop-leave-to { opacity: 0; }
.modal-enter-active, .modal-leave-active { transition: opacity 200ms cubic-bezier(0.16,1,0.3,1), transform 200ms cubic-bezier(0.16,1,0.3,1); }
.modal-enter-from { opacity: 0; transform: translateY(8px); }
```

**Acessibilidade**:
- Trap focus dentro do modal (use `useFocusTrap` do VueUse).
- `Escape` fecha.
- `aria-modal="true"`, `role="dialog"`, `aria-labelledby` no h3.
- Click no backdrop fecha (já no `@click.self`).
- Foco automático no primeiro input ao abrir (`onMounted` + `nextTick` + `inputRef.focus()`).

### 8.5 `AppToast`

```ts
const { show } = useToast();
show('Tarefa criada');
```

```vue
<Teleport to="body">
  <Transition name="toast">
    <div v-if="visible" class="toast">{{ message }}</div>
  </Transition>
</Teleport>
```

Specs:
- `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); bg: var(--color-text); color: #fff; padding: 10px 18px; border-radius: 10px; font-size: 13px; weight 500; box-shadow: --shadow-lg; z-index: 200;`
- entra: `translateY(20px) → 0; opacity 0 → 1; 200ms.`
- auto-dismiss: 1800ms (igual original) ou 3000ms (recomendado pela skill UX).

### 8.6 `AppMobileTabs`

Bottom-nav mobile (≤780px):

```vue
<nav class="mobile-tabs" v-if="isMobile">
  <button :class="{ active: panel === 'tarefas' }" @click="panel = 'tarefas'">Tarefas</button>
  <button :class="{ active: panel === 'agenda-trab' }" @click="panel = 'agenda-trab'">Agenda</button>
  <button :class="{ active: panel === 'pag-trab' }" @click="panel = 'pag-trab'">Pagtos</button>
  <button :class="{ active: panel === 'notas' }" @click="panel = 'notas'">Notas</button>
</nav>
```

Specs:
- `position: fixed; bottom: 0; left: 0; right: 0; bg: rgba(255,255,255,0.92); backdrop-filter: blur(20px) saturate(180%); border-top: 1px var(--color-border); padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); display: flex; justify-content: space-around; z-index: 20;`
- button: `flex: 1; padding: 8px 4px; font-size: 11px; weight 500; color: --color-text-3; border-radius: 6px;`
- `.active`: `bg: --color-surface-hover; color: --color-accent;`
- **Limite de 4 itens** (já está em conformidade com `bottom-nav-limit ≤5`).
- A view Trabalho usa este nav para alternar painéis; nas demais views (full-width), ocultar.

### 8.7 `BaseWarning` / `WarningBox`

Box amarelo de aviso (em modal de credencial):

```css
.warning-box {
  background: #fef7e6;
  border: 1px solid #f5d778;
  color: #7c5a00;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 14px;
}
```

```html
<BaseWarning>
  <strong>Atenção sobre credenciais.</strong> Use só para <strong>baixo risco</strong>...
</BaseWarning>
```

### 8.8 `TarefaFollowupSection`

Bloco do modal de tarefa:
```
[Toggle] Marcar como follow-up        — sub: "Aparece em amarelo na agenda"
[Data de cobrança]   [Descrição (titular)]   ← visíveis apenas quando ativo
```

```css
.followup-section { background: var(--color-followup-bg); border: 1px solid #f5d778; border-radius: 6px; padding: 12px; margin-top: 4px; }
.followup-section .followup-fields { display: none; }
.followup-section.ativo .followup-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
```

---

## 9. Páginas (Templates)

### 9.1 `/trabalho` — Cockpit multi-painel

Grid responsivo de painéis (desktop XL → mobile):

```css
.view-trabalho { background: var(--color-border); overflow: hidden; display: grid; gap: 1px; }

@media (min-width: 1500px)  { grid-template-columns: 1.2fr 0.95fr 0.7fr 0.85fr 0.85fr; } /* 5 cols */
@media (1200..1499px)        { grid-template-columns: 1.3fr 1fr 0.85fr 0.95fr; .panel.notas-panel { display: none; } } /* 4 cols, notas oculta */
@media (950..1199px)         { grid-template-columns: 1.4fr 1fr 0.95fr; .panel.pagamentos-panel { display: none; } } /* 3 cols */
@media (780..949px)          { grid-template-columns: 1.5fr 1fr; .panel.pm-panel { display: none; } } /* 2 cols */
@media (max-width: 780px)    { grid-template-columns: 1fr; .panel { display: none; } .panel.active-mobile { display: block; } }
```

Painéis (em ordem L→R):
1. **Tarefas** (`tarefas-panel`, `active-mobile` por padrão): Inbox + 6 horizontes + tarefas drag-droppable.
2. **Agenda** (`agenda-panel`): MiniCalendar + Legend + Controls + Grid3D (range = `agenda_3d_offset`).
3. **Pagamentos** (`pagamentos-panel`): MiniResumo + lista compacta (até 15 itens, próximos 14 dias). Botão `+` no head.
4. **Projetos & Metas** (`pm-panel`): duas seções (Projetos / Metas) com mini-cards.
5. **Notas** (`notas-panel`): filtros (Todos/Playbook/Credencial/Contato) + lista colapsável.

### 9.2 `/agenda` — Agenda full-width

```vue
<div class="clean-wrap">
  <div class="clean-head">
    <div>
      <h2>Agenda</h2>
      <div class="clean-desc">{{ periodo }}</div>
    </div>
    <div class="semana-nav">
      <BaseButton variant="ghost" @click="offset--">‹ anterior</BaseButton>
      <BaseButton variant="ghost" @click="offset = 0">hoje</BaseButton>
      <BaseButton variant="ghost" @click="offset++">próximo ›</BaseButton>
    </div>
  </div>
  <AgendaLegend/>
  <AgendaGrid3D :offset="ui.agenda_full_3d_offset" :tarefas/>
</div>
```

`.clean-wrap`: `padding: 20px; max-width: 900px; margin: 0 auto;`
`.clean-head`: `display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px var(--color-border);`
`.clean-head h2`: 22px / 600 / `--ls-h2`.
`.clean-desc`: 13px / `--color-text-3` / margin-top 4px.

### 9.3 `/pagamentos`

```
clean-head: H2 "Pagamentos" + "Provisionamento e acompanhamento." + [+ Pagamento]
PagamentoResumoCard × 3 (Pendentes / Atrasados / Pagos total)
BaseFilterPills: [Pendentes & Atrasados] [Todos] [Só pendentes] [Só atrasados] [Só pagos]
PagamentoCard list (sorted: atrasado → pendente → pago, depois por data)
```

`pagamentos-resumo`: `display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 10px; margin-bottom: 20px;`

`pagamento-resumo-card`:
- `bg: --color-surface; border: 1px var(--color-border); border-radius: 10px; padding: 14px 16px;`
- label 11px / uppercase / 500 / `--color-text-3`.
- valor mono 20px / 600 / tabular / margin-top 4px / cor por tone.

### 9.4 `/projetos`

```
clean-head: H2 "Projetos" + [+ Projeto]
BaseFilterPills: [Todos] [Empresas] [Produtos] [Geral] [Pessoal]
loop CATEGORIAS_PROJETO:
  ProjetoGrupo (h3 categoria)
    ProjetoCardExpandable[]
    Se categoria=empresa: para cada empresa, render produtos vinculados como `.produto-sub` indentados
```

`.projeto-grupo h3`: 12px / uppercase / ls=0.08em / `--color-text-3` / 600 / margin-bottom 8px.

### 9.5 `/metas`

```
clean-head: H2 "Metas" + [+ Meta]
BaseFilterPills: [Todos] [Ativas] [Vencendo (30d)] [Vencidas] [Concluídas]
MetaCardExpandable[] (sorted: vencidas → ativas → concluídas, depois por prazo)
```

### 9.6 `/notas`

```
clean-head: H2 "Notas" + "Playbooks, credenciais, contatos, decisões e referências." + [+ Nota]
BaseFilterPills: [Todos] [Playbooks] [Credenciais] [Contatos] [Decisões] [Referências]
.notas-completo grid auto-fill minmax(280px,1fr) gap 12px
NotaCard[] (mais recentes primeiro)
```

### 9.7 `/arquivo`

```
clean-head: H2 "Arquivo" + "Tudo arquivado. Restaure ou delete em definitivo."
BaseFilterPills: [Todos] [Tarefas] [Notas] [Pagamentos] [Projetos] [Metas]
ArquivoItem[] (sorted: mais recentes primeiro)
```

---

## 10. Modelo de dados e store (Pinia)

### 10.1 Tipos

```ts
// types/tarefa.ts
export type Horizonte = 'core30' | 'core60' | 'core90' | 'micro' | 'backlog' | 'hibernando';
export type TipoTarefa = 'CEO' | 'Delego' | 'Pessoal';

export interface Followup {
  ativo: boolean;
  data: string | null;       // 'YYYY-MM-DD'
  titular: string;            // '' = eu
}
export interface ChecklistItem { id: string; texto: string; done: boolean; }
export interface Anotacao { id: string; stamp: string; texto: string; }

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  horizonte: Horizonte;
  tipo: TipoTarefa;
  projeto_id: string | null;
  meta_id: string | null;
  delegado_para: string | null;
  data: string | null;
  hora: string | null;       // 'HH:MM'
  duracao: number | null;     // minutos
  followup: Followup;
  anotacoes: Anotacao[];
  reagendamentos: string[];   // strings já formatadas BR (dd/mm)
  checklist: ChecklistItem[];
  done: boolean;
  arquivada: boolean;
  criada_em: string;          // ISO
  atualizada_em: string;
}

// types/nota.ts
export type TipoNota = 'Playbook' | 'Credencial' | 'Contato' | 'Decisão' | 'Referência';
export interface Nota {
  id: string;
  titulo: string;
  corpo: string;
  tipo: TipoNota;
  projeto_id: string | null;
  status: 'Ativa' | 'Rascunho';
  arquivada: boolean;
  criada_em: string;
  atualizada_em: string;
}

// types/projeto.ts
export type CategoriaProjeto = 'empresa' | 'produto' | 'geral' | 'pessoal';
export interface Projeto {
  id: string;
  nome: string;
  categoria: CategoriaProjeto;
  empresa_id: string | null;     // produto pode pertencer a uma empresa
  meta_id: string | null;
  notas: string;
  arquivado: boolean;
  criada_em: string;
  atualizada_em: string;
}

// types/meta.ts
export interface Meta {
  id: string;
  titulo: string;
  descricao: string;
  prazo: string | null;
  arquivada: boolean;
  criada_em: string;
  atualizada_em: string;
}

// types/pagamento.ts
export interface Pagamento {
  id: string;
  descricao: string;
  valor: number;
  data: string | null;
  status: 'pendente' | 'pago';
  notas: string;
  arquivado: boolean;
  criada_em: string;
  atualizada_em: string;
}
```

### 10.2 Store UI (`stores/ui.ts`)

```ts
export const useUIStore = defineStore('ui', () => {
  const view = ref<View>('trabalho');
  const busca = ref('');
  const agenda_3d_offset = ref(0);
  const agenda_full_3d_offset = ref(0);
  const mc_month_offset = ref(0);
  const filtro_nota = ref<'todos' | TipoNota>('todos');
  const filtro_nota_full = ref<'todos' | TipoNota>('todos');
  const filtro_projeto = ref<'todos' | CategoriaProjeto>('todos');
  const filtro_meta = ref<'todos' | 'ativas' | 'vencendo' | 'vencidas' | 'concluidas'>('todos');
  const filtro_arquivo = ref<'todos' | 'tarefas' | 'notas' | 'pagamentos' | 'projetos' | 'metas'>('todos');
  const filtro_pagamento = ref<'pendentes' | 'todos' | 'pendente' | 'atrasado' | 'pago'>('pendentes');
  const projetos_expandidos = ref<string[]>([]);
  const metas_expandidas = ref<string[]>([]);
  const mobile_panel = ref<'tarefas' | 'agenda-trab' | 'pag-trab' | 'notas'>('tarefas');
  return { view, busca, agenda_3d_offset, agenda_full_3d_offset, mc_month_offset, filtro_nota, filtro_nota_full, filtro_projeto, filtro_meta, filtro_arquivo, filtro_pagamento, projetos_expandidos, metas_expandidas, mobile_panel };
});
```

### 10.3 Persistência

`stores/persistence.ts` deve coordenar:
- **Hidratação**: ao app montar, ler `localStorage.getItem('comando_brunno_v3')` e popular cada store.
- **Persistir**: `watch` agregado em todas as stores (`debounced 300ms`) — substitui o `save()` síncrono.
- **Export**: gera blob JSON.
- **Import**: confirma, substitui tudo.

> **No Nuxt 4 com SSR**: usar `useStorage()` do VueUse com `localStorage` apenas no client (`onMounted`), evitando hydration mismatch.

### 10.4 Computeds derivados (no respectivo store)

- `tarefasAtivas` = `state.tarefas.filter(t => !t.arquivada && !t.done)`
- `tarefasPorHorizonte(horizonte)` = filtra + ordena (done último, depois por data, depois por criada_em)
- `kpis` = `{ ativas, ceo, delego, core30, followup, hoje }` (ver `renderKPIs()` no original)
- `projetoById`, `metaById` — getters indexados.
- `progressoProjeto(pid)` → `{ feitas, total, pct }`
- `progressoMeta(mid)` → `{ feitas, total, totalT, totalP, tarefasFeitas, projetosFeitos, pct }` (lógica em `progressoMeta` no original)
- `statusMeta(m)` → `'ativa' | 'vencida' | 'concluida'`
- `statusPagamento(p)` → `'pendente' | 'pago' | 'atrasado'`
- `pessoasList` (datalist do modal): conjunto único de `delegado_para` + `followup.titular`.

---

## 11. Composables

### 11.1 `useToast`

```ts
const _state = reactive({ visible: false, message: '' });
let timer: any;
export function useToast() {
  const show = (msg: string, ms = 1800) => {
    _state.message = msg;
    _state.visible = true;
    clearTimeout(timer);
    timer = setTimeout(() => (_state.visible = false), ms);
  };
  return { state: readonly(_state), show };
}
```

### 11.2 `useConfirm`

```ts
export function useConfirm() {
  return (mensagem: string, onConfirm: () => void, opts?: { titulo?: string; okLabel?: string; okClass?: 'danger'|'primary' }) => { ... };
}
```

Render: `<ModalConfirm/>` montado uma vez em `app.vue` ouve um event-bus. Default: titulo=`Confirmar`, okLabel=`Confirmar`, okClass=`danger`. Fluxos do original que usam `okClass: 'primary'`: desvincular projeto de meta.

### 11.3 `useFormatBR`

```ts
export function useFormatBR() {
  return {
    fmtDate, fmtBRDate, fmtNowStamp, fmtBRL, fmtBRLShort,
    DOW: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
    DOW_FULL: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
    DOW_SHORT: ['D','S','T','Q','Q','S','S'],
    MESES: ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],
  };
}
```

(Reaproveitar o código do original linhas 1841–1857.)

### 11.4 `useTooltip`

Singleton que renderiza um único `<AgendaTooltip/>` em `app.vue`. Bind via `bindHover(el, () => content)`.

### 11.5 `useDragTask`

Wrapper para HTML5 DnD que padroniza:
- `useDragSource(taskId)` retorna handlers `{ onDragstart, onDragend }` + classe `dragging`.
- `useDropTarget(callback)` retorna handlers `{ onDragover, onDragleave, onDrop }` + classe `drop-hover`.

---

## 12. Acessibilidade

| # | Regra | Aplicação no Comando |
|---|---|---|
| A1 | Contraste ≥ 4.5:1 | Todas as combinações `--color-text` e `--color-text-2` sobre `--color-surface` passam (>= 7:1 e 5.7:1). `--color-text-3` (#86868b) sobre branco fica em ~4.5:1 — usar somente para labels uppercase / metadata. **Nunca usar `--color-text-3` para corpo.** |
| A2 | Focus rings | `BaseInput` já tem `box-shadow: 0 0 0 3px rgba(0,113,227,0.12)`. Aplicar mesmo padrão em `BaseButton` no `:focus-visible`. **Não remover outline em botões `.icon`.** |
| A3 | Aria labels | Botões com só ícone (modal-close, mc-prev/next, btn icon ghost de "+") **devem** ter `aria-label`. |
| A4 | Keyboard nav | Tab order natural + Esc fecha modais + Enter em inputs de captura (inbox / quick-add / checklist / anotação). |
| A5 | Heading hierarchy | h1 implícito = topbar `.titulo` (Comando) ou usar `<h1 visually-hidden>`. h2 das clean-pages. h3 dos modais. **Não pular níveis.** |
| A6 | Cor não é o único sinalizador | Status de pagamento usa **dot + label** (`Pendente/Pago/Atrasado`). Tipo de tarefa usa **badge com texto**. Followup usa **ícone de ampulheta + cor**. |
| A7 | Drag-and-drop alternativo | Adicionar atalho de teclado: select tarefa + `1..6` move para horizonte. Alternativa: botão "Mover para…" no expand do `TarefaCard`. |
| A8 | `aria-live` | Toast usa `aria-live="polite"` para anúncio. ModalConfirm usa `role="alertdialog"`. |
| A9 | `prefers-reduced-motion` | Desabilitar `pulse` (atrasado), simplificar slideUp do modal para fade puro, zerar `transition: width` da progress-bar. |
| A10 | Touch targets | `.btn.icon` 28×28 está abaixo de 44×44pt mobile. **No mobile (≤780px), aumentar para 44×44**. Os items da `mobile-tabs` já cumprem (≥48). |
| A11 | Inputs semânticos | Mobile keyboard apropriado: `type="date"`, `type="time"`, `type="number"`, `inputmode="decimal"` no valor de pagamento. |

---

## 13. Responsividade

Breakpoints **fixos**:

| Nome | Largura | Comportamento da view Trabalho |
|---|---|---|
| `xl` | ≥1500px | 5 colunas (Tarefas + Agenda + Pagamentos + PM + Notas) |
| `lg` | 1200–1499 | 4 colunas (oculta Notas) |
| `md` | 950–1199 | 3 colunas (oculta Pagamentos) |
| `sm` | 780–949 | 2 colunas (oculta PM) |
| `xs` | ≤780 | 1 coluna + AppMobileTabs (4 abas) |

Outras views (`/agenda`, `/pagamentos`, `/projetos`, `/metas`, `/notas`, `/arquivo`) usam `.clean-wrap` com `max-width: 900px; margin: 0 auto;` — sempre 1 coluna.

Topbar em mobile (`≤780`):
- `flex-wrap: wrap; padding: 10px 14px; gap: 10px;`
- brand: flex 1.
- KPIs: `order: 3; width: 100%;` (rolar horizontalmente).
- Search: `order: 4; width: 100%;`.

**Painel-body em mobile**: `padding-bottom: 80px;` para não esconder atrás da AppMobileTabs.

---

## 14. Animação & microinterações

| Onde | Duração | Easing | Detalhe |
|---|---|---|---|
| Modal backdrop fade | 150ms | linear | `opacity 0 → 1` |
| Modal slide-up | 200ms | `cubic-bezier(0.16,1,0.3,1)` | `translateY(8px) → 0; opacity 0 → 1` |
| Botão `:active` press | 100ms | linear | `transform: scale(0.97)` |
| Botão hover bg | 150ms | ease | mudança de `bg` |
| Task hover bg | 120ms | ease | bg + border-color |
| Task expand | n/a | n/a | (originalmente sem animação) — recomendado: `<Transition>` com `max-height + opacity 200ms ease-out`, respeitando reduced-motion |
| Toggle do followup-section | 150ms | linear | knob `transform: translateX(16px)` + bg do track |
| Progress-bar fill | 250–300ms | ease | `width` |
| Chevron rotate | 200ms | linear | `transform: rotate(180deg)` |
| Pagamento atrasado dot | 2000ms infinite | linear | `pulse` opacity 1 → 0.5 → 1 |
| Tooltip show | 120ms (com 150ms delay antes) | linear | `opacity 0 → 1` |
| Toast | 200ms | linear | `translateY(20px) + opacity` |
| Drop-hover ring | instant | n/a | `box-shadow: 0 0 0 2px var(--color-accent)` |

---

## 15. Anti-patterns (evitar)

1. **Emojis em UI estrutural** — todos virar SVG via `<BaseIcon>`. Emojis admitidos APENAS quando inseridos pelo usuário em texto livre (descrições, anotações).
2. **Sombras pesadas em cards de conteúdo** — só `--shadow-sm` em event do agenda; `--shadow-lg` apenas em modal/tooltip.
3. **Hex inline no template** — passar pelo design-token. Único caso aceitável: gradient inline em `style` de `BaseProgressBar` (porque varia por `tone`), mas o gradient deve usar variáveis CSS (`linear-gradient(90deg, var(--color-progresso-from), var(--color-progresso-to))`).
4. **Cor como único sinalizador** — sempre acompanhar de dot + texto.
5. **Nested scroll** — apenas um scroll por região: o `panel-body`. `agenda-grid` tem scroll interno (`ag-body max-height: 720px`). Evitar mais.
6. **Re-render manual** — substituir `renderAll()` por reatividade Vue. Cada `computed` calcula só o que mudou.
7. **Modal que vira página** — sempre manter modais; não criar `/tarefa/:id` em rota separada.
8. **Quebrar drag mobile** — manter HTML5 DnD desktop, mas providenciar fallback em mobile (botão "Mover para…").
9. **Ocultar painéis sem feedback** — quando um painel é ocultado por breakpoint, garantir que ainda existe acesso via mobile-tabs ou tabs-main (rotas dedicadas).
10. **Tipografia que faz iOS dar zoom** — todos os inputs em mobile devem ter `font-size: 16px` minimo (atualmente 13–14px no original; **corrigir em mobile** com `@media (max-width: 780px) { input, textarea, select { font-size: 16px; } }` ou equivalente).

---

## 16. Checklist de entrega

### Visual
- [ ] Tokens em `assets/css/tokens.css` cobrem **todas** as variáveis listadas em §4.
- [ ] Nenhum hex inline fora de gradients controlados.
- [ ] SVGs (Lucide) substituem todos os símbolos do original.
- [ ] Frosted glass em topbar + tabs + panel-head + mobile-tabs.

### Componentes base
- [ ] BaseButton implementa todas as 4 variantes + size icon-sm/icon-md.
- [ ] BaseBadge cobre 7 variants + tones por entidade.
- [ ] BaseInput tem variant search + flat.
- [ ] BaseProgressBar cobre os 4 tones (default/zero/full/vencida) + altura 3/4/6.
- [ ] BaseFilterPills é usado nas 5 listas (notas, projetos, metas, arquivo, pagamentos).

### Componentes compostos
- [ ] TarefaCard renderiza badges na ordem correta (followup OU agenda → progress → delegado → projeto → meta → tipo).
- [ ] TarefaCard cliques em badges/forms NÃO expandem o card.
- [ ] AgendaGrid3D faz auto-scroll para 7h ao montar.
- [ ] AgendaGrid3D event positioning: `top = startMin/60*48; height = max(28, dur/60*48)`.
- [ ] MiniCalendar marca `hoje`, `janela-ativa`, `tem-evento`, `tem-fup`.
- [ ] ProjetoCardExpandable mostra "+ Tarefa completa" + quick-add input dentro do body.
- [ ] MetaCardExpandable contém `m-help-line`s explicativas + projetos vinculados render como ProjetoCard com `desvincular`.

### Comportamentos
- [ ] Drag de tarefa entre horizontes funciona com classe `drop-hover` no destino.
- [ ] Quick-add de tarefa em projeto herda `meta_id` do projeto (linhas 2811–2837 do original).
- [ ] Reagendamento: ao mudar `data`, registra a anterior em `reagendamentos[]`.
- [ ] Ao trocar tipo para Delego no modal, o campo "Delegado para" aparece.
- [ ] Status do pagamento `atrasado` é derivado em runtime (não persistido).
- [ ] Toast aparece em: criar, atualizar, mover, arquivar, deletar, reabrir, exportar, importar, retirar agenda, anotação adicionada, etc.
- [ ] ModalConfirm é usado em **todas** as deleções e em `Substituir TODOS os dados?` (importar).
- [ ] Trap focus + Esc + click backdrop + foco automático no primeiro input ao abrir modal.

### Estado
- [ ] Pinia stores hidratam de `localStorage` no client.
- [ ] Persistência debounced (300ms).
- [ ] Export gera arquivo `comando-brunno-YYYY-MM-DD.json`.
- [ ] Import pede confirmação destrutiva.

### Acessibilidade
- [ ] aria-label em todos os botões só com ícone.
- [ ] Esc fecha modais.
- [ ] prefers-reduced-motion desativa `pulse` e simplifica modal slide.
- [ ] Mobile: input ≥16px font-size.
- [ ] Mobile: targets clicáveis ≥44px.

### Responsividade
- [ ] Breakpoints 1500/1200/950/780 aplicados na grid de painéis.
- [ ] AppMobileTabs aparece somente em `≤780`.
- [ ] Topbar reorganiza em wrap em mobile.
- [ ] `padding-bottom: 80px` em painéis mobile para não cobrir tabs.

### QA visual
- [ ] Em 1440px: 4 colunas no Trabalho (Tarefas + Agenda + Pagamentos + PM, Notas oculta).
- [ ] Pagamento atrasado tem dot pulsante.
- [ ] Tarefa concluída fica com strike + opacity reduzida do checkmark redondo verde.
- [ ] Followup task tem badge amarelo com ícone ampulheta.
- [ ] Projeto-produto vinculado a empresa fica indentado (24px) em `/projetos`.
- [ ] Meta `vencida` tem progress-bar gradient vermelho + dot vermelho.
- [ ] Meta `concluida` tem dot verde + progress 100% verde.

---

## 17. Apêndice — paridade exata com o original

Para guiar revisão por DIFF visual, mapeamento por linha do HTML:

| Linhas do `Comando_Brunno-2 (1).html` | Componente Vue equivalente |
|---|---|
| 102–168 (`.app`, `.topbar`, `.kpi`, `.btn`) | `app.vue`, `AppTopbar`, `KPIBadge`, `BaseButton` |
| 170–203 (`.tabs-main`, `.tab-main`) | `AppTabsMain` |
| 215–238 (`.panel`, `.panel-head`) | `AppPanel` |
| 241–283 (`.horizonte`, `.horizonte-head`, `.horizonte-body`) | `TarefaHorizonte` |
| 285–323 (`.task`, `.task-main`, `.check`, `.task-titulo`) | `TarefaCard`, `BaseCheckbox` |
| 325–349 (`.task-badges`, `.badge-*`) | `BaseBadge` |
| 351–353 (`.progress-bar`) | `BaseProgressBar` |
| 355–433 (`.task-expand`, `.checklist-*`, `.anotacoes`, `.reagendamentos`) | `TarefaCard` (expand) + `TarefaChecklist` + `TarefaAnotacoes` + `TarefaReagendamentos` |
| 435–443 (`.inbox`) | `TarefaInbox` |
| 444–476 (`.minicalendar`) | `AgendaMiniCalendar` |
| 477–500 (`.agenda-controls`, `.agenda-legend`) | `AgendaControls`, `AgendaLegend` |
| 501–649 (`.agenda-grid`, `.ag-*`) | `AgendaGrid3D`, `AgendaEvent` |
| 651–725 (`.tooltip`) | `AgendaTooltip` + `useTooltip` |
| 727–775 (`.pag-mini-resumo`, `.pag-mini-card`, `.pag-mini-item`, `.pag-mini-lista`) | `PagamentoMiniResumo`, `PagamentoMiniItem` |
| 777–819 (`.pagamento-card`, `.pagamentos-resumo`, `.pagamento-resumo-card`) | `PagamentoCard`, `PagamentoResumoCard` |
| 821–851 (`.nota`, `.notas-filtros`, `.projetos-filtros`, etc) | `NotaCard`, `BaseFilterPills` |
| 853–860 (`.clean-wrap`, `.clean-head`) | layout das pages clean (`/agenda`, `/pagamentos`, `/projetos`, `/metas`, `/notas`, `/arquivo`) |
| 860–956 (`.projeto-card`, `.projeto-card.expandable`, `.p-quick-add`, `.p-footer`, `.p-progress`) | `ProjetoCardExpandable`, `ProjetoQuickAdd` |
| 959–1076 (`.meta-card`, `.m-*`) | `MetaCardExpandable` |
| 1078–1135 (`.pm-section`, `.pm-mini-card`, `.badge-meta`) | `PMSection`, `PMMiniCard`, `BaseBadge variant="meta"` |
| 1137–1151 (`.arquivo-item`, `.notas-completo`) | `ArquivoItem`, layout grid em `/notas` |
| 1154–1212 (`.modal-backdrop`, `.modal`, `.field`, `.warning-box`, `.followup-section`) | `AppModal`, `BaseField`, `BaseWarning`, `TarefaFollowupSection` |
| 1213–1250 (media queries) | breakpoints definidos em §13 |
| 1252–1268 (`.toast`, `.empty-state`, `.view`) | `AppToast`, `BaseEmptyState`, lógica de rota Nuxt |

---

> **Como usar este spec**: gere os componentes na ordem Atoms → Molecules → Organisms → Pages. Cada componente deve ser implementado com:
>
> 1. Uma `<script setup lang="ts">` tipada conforme `interface Props`/`Emits` listadas aqui.
> 2. CSS escopado (`<style scoped>`) consumindo **somente** custom-properties de `tokens.css`.
> 3. Storybook (opcional) com snapshot em todos os tones/variants.
>
> Em caso de divergência entre este spec e o HTML original, **o HTML é a fonte da verdade**. Reabrir o spec e atualizar.

# Comando · Design System (MASTER)

> **Fonte de verdade operacional.** Antes de escrever CSS em qualquer `.vue`, leia
> este arquivo. Ele é curto de propósito — o racional longo e o inventário de
> componentes estão em `design-spec-comando.md` (2012 linhas), que é referência,
> não regra do dia a dia.
>
> Onde os dois discordarem, **o MASTER vence** (ver §7).

**Verificação:** `pnpm lint:tokens` · **Tokens:** `packages/ui/app/assets/css/main.css`

---

## 0. Onde o design system mora

Componentes visuais e tokens vivem em **`packages/ui`**, um Nuxt Layer consumido
pelo app via `extends: ['./packages/ui']`.

```
packages/ui/app/
├─ assets/css/     reset · main (tokens) · tokens (alias legado) · utilities
├─ components/
│  ├─ base/        primitivas — pathPrefix: false
│  ├─ chrome/      AppModal · AppPanel · AppSheet · AppMobileTabs
│  └─ *.vue        AppSegmented · AppToggle · AppCircleCheck · PageHeader
├─ composables/    useTooltip
└─ types.ts        ActionItem · ContextMenuItem  (alias `#ui`)
```

**A fronteira é a regra:** o package **não pode importar nada do app** — nem
store, nem composable de domínio, nem `~/utils`. Se um componente precisa de
`useTasks`, ele não é do design system; é feature e mora em `app/components/`.
Foi assim que `BoardCard`/`BoardColumn` acabaram em `base/` sem serem primitivas
— hoje estão em `app/components/quadros/`.

Na prática nada muda no uso diário: **auto-import continua funcionando**.
`<BaseIcon>`, `<AppModal>`, `<BaseButton>` estão disponíveis em qualquer `.vue`
sem `import`. Só os **tipos** precisam de import explícito:

```ts
import type { ActionItem, ContextMenuItem } from '#ui/types'
```

Dependência nova usada só por componente visual (ícones, drag, máscara) entra no
`package.json` de `packages/ui`, não no da raiz.

---

## 1. Regra número um

**`packages/ui/app/assets/css/main.css` é a única fonte de tokens.** Todo token novo nasce lá.

`packages/ui/app/assets/css/tokens.css` é **camada de compatibilidade em depreciação**: só
contém aliases `--color-*` → nome curto, para os componentes que ainda usam o
prefixo do `design-spec §4`. Não adicione nada nele. Ao editar um componente que
usa `--color-surface`, troque por `--surface` e siga em frente.

Ordem de carga (em `packages/ui/nuxt.config.ts`, importa e não mexa):
`reset` → `main` → `tokens` → `utilities`. O app não declara `css` — quem declara é o layer.

---

## 2. Escalas fechadas

Estes três eixos têm **tolerância zero**. `pnpm lint:tokens` reprova qualquer
valor fora da lista, e as três estão em zero violação hoje.

### Tipografia
```
9  10  11  12  13  14  15  16  17  18  20  22  26  32  48  64
```
Os degraus vieram do uso real, não de uma régua teórica:
`13px` é o mais comum (120 usos), `26px` é o título de página (10 usos),
`17px` é o empty-state/corpo grande (9 usos). `9`/`10` **só** para label
uppercase. `14` é o corpo. `48`/`64` são a faixa display (placar de `/vida`).

**Decimal é proibido.** Nada de `12.5px`. Se 12 parece pequeno e 13 grande, o
problema é a hierarquia ao redor, não o meio pixel. Isso não é teoria: a regex
original do guard exigia dígito colado no `px`, então `12.5px` não casava com
nada e **70 tamanhos decimais viveram meses sem serem vistos** — só apareceram
na revisão do PR #1. Foram arredondados para cima.

### Border-radius
```
--radius-xs 4 · --radius-sm 6 · --radius 10 · --radius-md 12
--radius-lg 14 · --radius-xl 18 · --radius-2xl 22 · --radius-pill 999
```
`0` e `50%` são livres. `--radius-xs` existe para elementos minúsculos (spark
bars, barra de progresso, checkbox quadrado), onde 6px já arredonda demais.

### Espaçamento
`padding` / `margin` / `gap` usam **valores pares**. `1px` é permitido (hairline
de borda). Ímpares (3, 5, 7, 9, 11, 13) são reprovados.

> **Não convertemos espaçamento para `var(--sp-*)` e não vamos converter.**
> São ~1400 declarações; o ganho não paga o churn. O guard valida o **valor**,
> não a sintaxe. Use px cru à vontade, desde que par.

---

## 3. Cor

**Nunca escreva hex ou `rgba()` cru num componente.** Use token.

| Precisa de… | Use |
|---|---|
| Fundo da página | `--bg` |
| Card / superfície | `--surface`, `--surface-alt`, `--surface-hover`, `--surface-2` |
| Texto | `--text` → `--text-2` → `--text-3` → `--text-4` |
| Borda hairline | `--border`, `--border-strong`, `--border-faint` |
| Marca / link / foco | `--accent`, `--accent-hover`, `--accent-soft` |
| Anel de foco | `--accent-ring` (leve), `--accent-ring-strong` |
| **Texto/ícone sobre fill saturado** | `--accent-fg` |
| Ação primária | `--primary` / `--on-primary` |
| Semântico | `--success`, `--warning`, `--danger`, `--amber` (+ `-bg`) |
| Entidades | `--ceo-*`, `--delego-*`, `--pessoal-*`, `--core7-bar`…, `--nota-*`, `--pag-*`, `--proj-*`, `--meta-*` |

> ⚠️ `--accent-fg` e `--surface` são ambos `#ffffff` mas significam **coisas
> opostas**: `--accent-fg` é o branco *por cima* de um preenchimento colorido
> (texto de chip, check dentro do checkbox, spinner sobre accent); `--surface` é
> o branco *do fundo* de um card. Escolher errado não aparece hoje, mas aparece
> no dia em que um dos dois mudar.

**Dívida atual:** 41 arquivos ainda têm literal cru (284 ocorrências), quase toda
concentrada nas superfícies de marca. Está registrada em `token-baseline.json` e
só pode encolher — ver §5.

---

## 4. Componentes

- **Ícone é sempre `<BaseIcon>`.** Nunca emoji estrutural, nunca `<svg>` solto.
  `packages/ui/app/components/base` tem `pathPrefix: false`, então `<BaseIcon>` é auto-importado
  em qualquer lugar — não precisa de `import`. Nomes são Lucide em kebab-case.
  *Exceção:* emoji como **conteúdo semântico** (a escala de humor em
  `DailyCheckinCard`) é válido — por isso vive no `<script>`, como dado, e não no
  template.
- **Hairline acima de sombra.** Card = `1px solid var(--border)`. Sombra só em
  modal, sheet, tooltip e popover.
- **Número é tabular.** Data, valor, %, contador → classe `.tabular` (ou
  `font-variant-numeric: tabular-nums`). Já é default no `body`.
- **Frosted só em chrome.** Topbar, tabs, panel-head. Nunca em conteúdo.
- **Uma CTA primária por tela.** O resto é `ghost`.
- **Motion:** `--dur-fast` 150ms para micro-interação, `--dur-base` 240ms para
  transição, `--ease-spring` como curva padrão. `prefers-reduced-motion` já é
  tratado globalmente em `main.css` — não redeclare por componente.

---

## 5. Proibido

O guard (`pnpm lint:tokens` + `tests/unit/checkTokens.test.ts`) reprova:

| # | Proibido | Regime |
|---|---|---|
| 1 | `font-size` fora da escala §2 | falha sempre |
| 2 | `border-radius` fora da escala §2 | falha sempre |
| 3 | `padding`/`margin`/`gap` ímpar (>1px) | falha sempre |
| 4 | Seletor de tema `.dark` / `html.dark` | falha sempre |
| 5 | `#hex` ou `rgba()` cru no `<style>` | baseline — só encolhe |
| 6 | Emoji em nó de texto do `<template>` | baseline — só encolhe |

Não reprovado, mas igualmente proibido por convenção: **token novo em
`tokens.css`** (§1).

**Como o baseline funciona.** `design-system/token-baseline.json` guarda a
contagem por arquivo. Passar do teto reprova; ficar abaixo emite aviso pedindo
para travar o ganho com `pnpm lint:tokens --update-baseline`. Foi escolhido assim
de propósito: o guard vale desde hoje, sem exigir limpar 100% antes, e a dívida
fica impedida de crescer.

**Falsos positivos que já estão tratados** (não "conserte" o guard de novo):
`.spinner.dark` é variante de componente, não tema — só `.dark ` *descendente* é
reprovado. Setas `→` em comentário ou em `title=`/`aria-label=` são prosa, não
ícone — o contador só olha nó de texto.

---

## 6. Dark mode: removido

O app é **light-only**. Não existe `.dark`, nem `@nuxtjs/color-mode`, nem toggle
de tema. `html { color-scheme: light }` em `packages/ui/app/assets/css/main.css`
é a única declaração.

Se um dia voltar, o caminho é: reintroduzir o bloco `.dark` em `main.css` com os
**nomes curtos** (que os aliases de `tokens.css` propagam de graça), não espalhar
seletor `.dark` por componente — foi exatamente isso que deu errado antes.

---

## 7. Divergências deliberadas do `design-spec-comando.md`

| Spec diz | Aqui | Por quê |
|---|---|---|
| §4 — tokens com prefixo `--color-*` | Nomes curtos (`--bg`, `--text`) são canônicos | 75 arquivos já usavam os curtos contra 34 nos longos. Inverter custaria mais e renderia o mesmo. |
| §4.6 — `--dur-base: 150ms` | `--dur-base: 240ms` | Os dois arquivos declaravam o token; `main.css` carregava depois e **já vencia**. 240ms era o valor real em produção — documentamos o que roda, não o que estava escrito. |
| §1 — "dark mode é evolução planejada" | Removido | Decisão do produto. Ver §6. |

---

## 8. Overrides por página

Só existem quando a página **desvia de verdade** do MASTER. Hoje:

- [`pages/landing.md`](pages/landing.md) — `/` (`pages/index.vue`)
- [`pages/login.md`](pages/login.md) — `/login` e layouts `auth`/`booking`

Ao construir uma página, cheque se há arquivo em `design-system/pages/<pagina>.md`.
Se houver, ele **sobrepõe** o MASTER. Se não, o MASTER vale integralmente.

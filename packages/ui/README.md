# @comando/ui

Design system do Comando: primitivas visuais, chrome de layout e os tokens CSS.
É um **Nuxt Layer**, não um package buildado — não há `dist/` nem etapa de build.

O app da raiz consome com:

```ts
// nuxt.config.ts
extends: ['./packages/ui']
```

## A regra

**Nada aqui pode importar do app.** Sem store, sem composable de domínio, sem
`~/utils`. Um componente que precisa de `useTasks` não é design system — é
feature, e mora em `app/components/`.

Foi por não ter essa fronteira que `BoardCard` e `BoardColumn` acabaram dentro de
`base/` importando `useTasks`. Hoje estão em `app/components/quadros/`.

## Uso

Componentes são auto-importados pelo Nuxt — não precisa de `import`:

```vue
<BaseButton variant="primary">Salvar</BaseButton>
<AppModal v-model:open="open" titulo="Editar" />
```

Tipos, sim, precisam:

```ts
import type { ActionItem, ContextMenuItem } from '#ui/types'
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `app/assets/css/` | `reset` · `main` (tokens) · `tokens` (alias legado) · `utilities` |
| `app/components/base/` | primitivas — registradas com `pathPrefix: false` |
| `app/components/chrome/` | `AppModal` · `AppPanel` · `AppSheet` · `AppMobileTabs` |
| `app/components/*.vue` | `AppSegmented` · `AppToggle` · `AppCircleCheck` · `PageHeader` |
| `app/composables/` | `useTooltip` |
| `app/types.ts` | superfície pública de tipos (alias `#ui`) |

## Regras e verificação

As regras (escalas de tipografia/radius/espaçamento, uso de token em vez de hex)
estão em [`design-system/MASTER.md`](../../design-system/MASTER.md) na raiz e
valem igualmente aqui — `pnpm lint:tokens` varre este package junto com o app.

Dependência usada só por componente visual entra no `package.json` **daqui**, não
no da raiz.

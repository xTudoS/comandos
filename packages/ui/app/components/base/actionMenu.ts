// Shared types for BaseActionMenu — o menu "⋯" de ações de um card/linha.
//
// Vivem num .ts separado, e não dentro do SFC, pelo mesmo motivo de
// `contextMenu.ts`: o auto-import do Nuxt registra o componente mas não
// exporta os tipos dele. Consumidores importam via `#ui/types`.

export type ActionTone = 'default' | 'warning' | 'danger'

export interface ActionItem {
  key: string
  label: string
  /** nome do ícone lucide (kebab-case). */
  icon?: string
  tone?: ActionTone
  disabled?: boolean
}

/**
 * Superfície pública de tipos do @comando/ui.
 *
 * O auto-import do Nuxt registra os COMPONENTES, mas não os tipos que eles
 * usam nas props. Quem precisa de um tipo importa daqui:
 *
 *   import type { ActionItem, ContextMenuItem } from '#ui/types'
 *
 * O alias `#ui` é declarado no nuxt.config deste layer.
 */
export type { ActionItem, ActionTone } from './components/base/actionMenu'
export type { ContextMenuItem, ContextTone } from './components/base/contextMenu'

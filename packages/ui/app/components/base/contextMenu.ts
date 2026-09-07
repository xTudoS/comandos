// Shared types for the graphite right-click context menu
// (BaseContextMenu + BaseContextMenuList). Mirrors the Relatel-style
// floating panel: icons, grouped items, submenus and a danger tone.

export type ContextTone = 'default' | 'danger'

export interface ContextMenuItem {
  /** Unique key emitted on `select`. Omit for separators. */
  key?: string
  label?: string
  /** lucide icon name (kebab-case), rendered at the leading edge. */
  icon?: string
  tone?: ContextTone
  disabled?: boolean
  /** Renders a hairline divider; all other fields are ignored. */
  separator?: boolean
  /** Optional right-aligned shortcut hint (e.g. `⌘F`). */
  shortcut?: string
  /** Marks the active/checked state (leading dot fills in). */
  checked?: boolean
  /** Nested items — turns the row into a submenu trigger. */
  children?: ContextMenuItem[]
}

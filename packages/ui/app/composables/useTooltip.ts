// useTooltip — per design-spec-comando.md §6.11, §11.4
//
// Singleton tooltip global posicionado em `position: fixed` no <BaseTooltip>
// (chrome). Qualquer componente bind seu elemento via `bindHover(el, () => content)`.
//
// O conteúdo é uma factory para que o consumidor calcule chips/desc no
// momento do hover, sem precisar reativar.

import { reactive, readonly } from 'vue'

export interface TooltipChip {
  label: string
  tone?: 'accent' | 'warning' | 'success' | 'danger' | 'muted'
}

export interface TooltipContent {
  variant?: 'normal' | 'fup'
  time?: string // 'HH:MM' ou 'dd/mm HH:MM'
  titulo?: string
  desc?: string
  chips?: TooltipChip[]
  hint?: string // ex.: 'Clique para editar'
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  content: TooltipContent
}

const _state = reactive<TooltipState>({
  visible: false,
  x: 0,
  y: 0,
  content: {},
})

let _showTimer: ReturnType<typeof setTimeout> | null = null
const SHOW_DELAY = 150 // ms — spec §6.11

function _position(e: MouseEvent | { clientX: number; clientY: number }): void {
  // Auto-flip on edges. Defaults: 12px to the right and 16px below cursor.
  const padding = 12
  const margin = 16
  const ttW = 240 // approx; final dims set in CSS (max-width 320)
  const ttH = 90
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  let x = e.clientX + margin
  let y = e.clientY + margin
  if (x + ttW + padding > vw) x = e.clientX - ttW - margin
  if (y + ttH + padding > vh) y = e.clientY - ttH - margin
  _state.x = Math.max(padding, x)
  _state.y = Math.max(padding, y)
}

function bindHover(
  el: HTMLElement,
  contentFactory: () => TooltipContent,
): () => void {
  const onEnter = (e: MouseEvent) => {
    if (_showTimer) clearTimeout(_showTimer)
    _showTimer = setTimeout(() => {
      _state.content = contentFactory()
      _position(e)
      _state.visible = true
    }, SHOW_DELAY)
  }
  const onMove = (e: MouseEvent) => {
    if (_state.visible) _position(e)
  }
  const onLeave = () => {
    if (_showTimer) clearTimeout(_showTimer)
    _state.visible = false
  }

  el.addEventListener('mouseenter', onEnter)
  el.addEventListener('mousemove', onMove)
  el.addEventListener('mouseleave', onLeave)
  el.addEventListener('blur', onLeave)

  // Cleanup function — caller pode chamar onUnmounted.
  return () => {
    if (_showTimer) clearTimeout(_showTimer)
    el.removeEventListener('mouseenter', onEnter)
    el.removeEventListener('mousemove', onMove)
    el.removeEventListener('mouseleave', onLeave)
    el.removeEventListener('blur', onLeave)
  }
}

function hide(): void {
  if (_showTimer) clearTimeout(_showTimer)
  _state.visible = false
}

export function useTooltip() {
  return {
    state: readonly(_state),
    bindHover,
    hide,
  }
}

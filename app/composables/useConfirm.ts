// useConfirm — per design-spec-comando.md §11.2
//
// Singleton confirm dialog. ModalConfirm (chrome) é renderizado UMA vez no
// layout default e ouve este state.

import { reactive, readonly } from 'vue'

interface ConfirmOpts {
  titulo?: string
  okLabel?: string
  cancelLabel?: string
  okClass?: 'danger' | 'primary' | 'warning'
}

interface ConfirmState {
  open: boolean
  titulo: string
  mensagem: string
  okLabel: string
  cancelLabel: string
  okClass: 'danger' | 'primary' | 'warning'
}

const _state = reactive<ConfirmState>({
  open: false,
  titulo: 'Confirmar',
  mensagem: '',
  okLabel: 'Confirmar',
  cancelLabel: 'Cancelar',
  okClass: 'danger',
})

let _onConfirm: (() => void) | null = null
let _onCancel: (() => void) | null = null

function ask(
  mensagem: string,
  onConfirm: () => void,
  opts: ConfirmOpts = {},
  onCancel?: () => void,
): void {
  _state.mensagem = mensagem
  _state.titulo = opts.titulo ?? 'Confirmar'
  _state.okLabel = opts.okLabel ?? 'Confirmar'
  _state.cancelLabel = opts.cancelLabel ?? 'Cancelar'
  _state.okClass = opts.okClass ?? 'danger'
  _state.open = true
  _onConfirm = onConfirm
  _onCancel = onCancel ?? null
}

function _resolveOk(): void {
  _state.open = false
  const fn = _onConfirm
  _onConfirm = null
  _onCancel = null
  fn?.()
}

function _resolveCancel(): void {
  _state.open = false
  const fn = _onCancel
  _onConfirm = null
  _onCancel = null
  fn?.()
}

export function useConfirm() {
  return {
    state: readonly(_state),
    ask,
    /** Used by ModalConfirm to dispatch user choice — not intended for callers. */
    _resolveOk,
    _resolveCancel,
  }
}

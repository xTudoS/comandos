// useToast — per design-spec-comando.md §11.1, §8.5
//
// Singleton toast: módulo-level state, qualquer componente lê via composable.
// AppToast (chrome) renderiza UMA vez em layouts/default.vue.

import { reactive, readonly } from 'vue'

interface ToastState {
  visible: boolean
  message: string
}

const _state = reactive<ToastState>({
  visible: false,
  message: '',
})

let _timer: ReturnType<typeof setTimeout> | null = null

function show(message: string, ms = 1800): void {
  _state.message = message
  _state.visible = true
  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(() => {
    _state.visible = false
  }, ms)
}

function dismiss(): void {
  _state.visible = false
  if (_timer) clearTimeout(_timer)
}

export function useToast() {
  return {
    state: readonly(_state),
    show,
    dismiss,
  }
}

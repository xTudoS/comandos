<script setup lang="ts">
// AppModal — per design-spec-comando.md §8.4
//
// Modal genérico (Teleport + Transition). Acessibilidade:
// - role=dialog + aria-modal
// - Escape fecha
// - click no backdrop fecha
// - foco automático no primeiro input ao abrir
// - foco volta ao trigger ao fechar (preservedFocus pattern)
//
// Trap-focus: implementação simples (cycling) sem dependência externa.

import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import BaseIcon from '../base/BaseIcon.vue'

interface Props {
  open: boolean
  titulo?: string
  maxWidth?: number // default 560
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxWidth: 560,
  closeOnBackdrop: true,
  closeOnEsc: true,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
  open: []
}>()

const titleId = useId()
const dialogRef = ref<HTMLElement | null>(null)
const previouslyFocused = ref<HTMLElement | null>(null)

function close() {
  if (!props.open) return
  emit('update:open', false)
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape' && props.closeOnEsc) {
    e.stopPropagation()
    close()
  } else if (e.key === 'Tab') {
    trapFocus(e)
  }
}

function trapFocus(e: KeyboardEvent) {
  const root = dialogRef.value
  if (!root) return
  const focusables = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  if (focusables.length === 0) return
  const first = focusables[0]!
  const last = focusables[focusables.length - 1]!
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

function onBackdropClick() {
  if (props.closeOnBackdrop) close()
}

function focusFirst() {
  nextTick(() => {
    const root = dialogRef.value
    if (!root) return
    const target = root.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, button:not([data-modal-close]), [tabindex]:not([tabindex="-1"])',
    )
    target?.focus()
  })
}

watch(
  () => props.open,
  (open) => {
    // DOM-only: o handler toca em document/activeElement/body. No SSR pulamos —
    // o estado real será aplicado quando o componente hidratar no cliente.
    if (import.meta.server) return
    if (open) {
      previouslyFocused.value = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKey, true)
      // Lock body scroll.
      document.body.style.overflow = 'hidden'
      emit('open')
      focusFirst()
    } else {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = ''
      previouslyFocused.value?.focus?.()
      previouslyFocused.value = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey, true)
  document.body.style.overflow = ''
})

const styleVars = computed(() => ({ maxWidth: `${props.maxWidth}px` }))
</script>

<template>
  <Teleport to="body">
    <Transition name="m-backdrop">
      <div
        v-if="open"
        class="m-backdrop"
        @mousedown.self="onBackdropClick"
      >
        <Transition name="m-modal" appear>
          <div
            ref="dialogRef"
            class="m-modal"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titulo ? titleId : undefined"
            :style="styleVars"
          >
            <header class="m-modal__head">
              <h3 v-if="titulo" :id="titleId" class="m-modal__title">{{ titulo }}</h3>
              <slot name="head" />
              <button
                type="button"
                class="m-modal__close"
                aria-label="Fechar"
                data-modal-close
                @click="close"
              >
                <BaseIcon name="x" :size="16" />
              </button>
            </header>

            <div class="m-modal__body">
              <slot />
            </div>

            <footer v-if="$slots.actions" class="m-modal__foot">
              <slot name="actions" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.m-modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
  color: var(--text);
}

.m-modal__head {
  padding: 18px 22px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.m-modal__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.018em;
  color: var(--text);
  flex: 1;
}

.m-modal__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
  flex: 0 0 auto;
}
.m-modal__close:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.m-modal__close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.m-modal__body {
  padding: 6px 22px 20px;
  overflow-y: auto;
  flex: 1;
}

.m-modal__foot {
  padding: 14px 22px;
  border-top: 1px solid var(--border-faint);
  background: var(--surface-alt);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

/* Animations — match AppSheet (scale + fade) */
.m-backdrop-enter-active,
.m-backdrop-leave-active {
  transition: opacity var(--dur-base) var(--ease-spring);
}
.m-backdrop-enter-from,
.m-backdrop-leave-to {
  opacity: 0;
}

.m-modal-enter-active {
  transition:
    opacity var(--dur-slow) var(--ease-spring),
    transform var(--dur-slow) var(--ease-spring);
}
.m-modal-leave-active {
  transition: opacity var(--dur-base) var(--ease-spring);
}
.m-modal-enter-from {
  opacity: 0;
  transform: scale(0.94) translateY(12px);
}
.m-modal-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .m-modal-enter-from {
    transform: none;
  }
}

@media (max-width: 640px) {
  .m-backdrop {
    padding: 0;
    align-items: flex-end;
  }
  .m-modal {
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    max-height: 92vh;
  }
}
</style>

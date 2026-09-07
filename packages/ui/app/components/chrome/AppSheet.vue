<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

interface Props {
  open: boolean
  dismissible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  dismissible: true,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

function close() {
  if (!props.dismissible) return
  emit('update:open', false)
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (import.meta.server) return
    if (open) {
      document.addEventListener('keydown', onKey, true)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = ''
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey, true)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-overlay">
      <div
        v-if="open"
        class="sheet-overlay"
        @mousedown.self="close"
      >
        <Transition name="sheet-content" appear>
          <div
            class="sheet-content"
            role="dialog"
            aria-modal="true"
          >
            <slot />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.sheet-content {
  border-radius: var(--radius-xl);
  background: var(--bg);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.sheet-overlay-enter-active,
.sheet-overlay-leave-active {
  transition: opacity var(--dur-base) var(--ease-spring);
}
.sheet-overlay-enter-from,
.sheet-overlay-leave-to {
  opacity: 0;
}

.sheet-content-enter-active {
  transition:
    opacity var(--dur-slow) var(--ease-spring),
    transform var(--dur-slow) var(--ease-spring);
}
.sheet-content-leave-active {
  transition:
    opacity var(--dur-base) var(--ease-spring);
}
.sheet-content-enter-from {
  opacity: 0;
  transform: scale(0.94) translateY(12px);
}
.sheet-content-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-content-enter-from {
    transform: none;
  }
}

@media (max-width: 640px) {
  .sheet-overlay {
    padding: 0;
    align-items: flex-end;
  }
  .sheet-content {
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    max-height: 92vh;
  }
}
</style>

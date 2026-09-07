<script setup lang="ts">
// Aviso de preparação offline: "Baixando para uso offline…" enquanto sincroniza
// e "✓ Pronto para funcionar offline" quando conclui (transitório).
import { ref, watch } from 'vue'
import { useOfflineStatus } from '~/composables/useOfflineSync'

const status = useOfflineStatus()
const showReady = ref(false)

watch(
  () => status.value,
  (s, prev) => {
    if (s === 'ready' && prev === 'downloading') {
      showReady.value = true
      setTimeout(() => (showReady.value = false), 4000)
    }
  },
)

const visible = computed(() => status.value === 'downloading' || showReady.value)
</script>

<template>
  <Teleport to="body">
    <Transition name="offline-ready">
      <div
        v-if="visible"
        class="offline-ready"
        :class="{ done: showReady && status === 'ready' }"
        role="status"
        aria-live="polite"
      >
        <template v-if="status === 'downloading'">
          <span class="spinner" aria-hidden="true" />
          Baixando para uso offline…
        </template>
        <template v-else>
          <BaseIcon name="check" :size="14" />
          Pronto para funcionar offline
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.offline-ready {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  z-index: 9998;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 550;
  color: var(--accent-fg);
  background: #1f2937;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.offline-ready.done {
  background: var(--success);
}

.spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: var(--accent-fg);
  animation: offline-spin 0.7s linear infinite;
}
@keyframes offline-spin {
  to {
    transform: rotate(360deg);
  }
}

.offline-ready-enter-active,
.offline-ready-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.offline-ready-enter-from,
.offline-ready-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>

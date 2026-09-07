<script setup lang="ts">
// Indicador global de conexão. Aparece apenas quando o app está offline,
// como um banner fino fixo no topo — não flutua sobre o conteúdo nem
// atrapalha os controles do rodapé.
import { useOnline } from '~/composables/useOnline'

const { isOffline } = useOnline()
</script>

<template>
  <Teleport to="body">
    <Transition name="offline-banner">
      <div v-if="isOffline" class="offline-banner" role="status" aria-live="polite">
        <span class="offline-banner__dot" aria-hidden="true" />
        Sem conexão — trabalhando localmente
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 6px 12px;
  padding-top: calc(6px + env(safe-area-inset-top));
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--accent-fg);
  background: #1f2937;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.offline-banner__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  flex-shrink: 0;
}

.offline-banner-enter-active,
.offline-banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.offline-banner-enter-from,
.offline-banner-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>

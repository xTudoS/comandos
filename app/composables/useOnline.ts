import { ref, computed, readonly } from 'vue'

// Estado global de conectividade (singleton compartilhado entre componentes).
const online = ref(true)
let initialized = false

function update() {
  online.value = typeof navigator !== 'undefined' ? navigator.onLine : true
}

/**
 * useOnline — expõe o estado de conexão de forma reativa.
 * Registra os listeners `online`/`offline` uma única vez no client.
 */
export function useOnline() {
  if (import.meta.client && !initialized) {
    initialized = true
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
  }

  return {
    online: readonly(online),
    isOffline: computed(() => !online.value),
  }
}

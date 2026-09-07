<script setup lang="ts">
// Shell estático para navegação offline (cold-start).
//
// Prerenderizado no build (ver routeRules em nuxt.config) e usado como fallback
// de precache do service worker: quando a navegação falha por falta de rede, o
// SW serve este HTML, o Nuxt monta no cliente e o roteador renderiza a rota real
// a partir do cache (dados de /api em cache + sessão pela janela de graça).
definePageMeta({ layout: false })

// A rota pedida precisa ser capturada ANTES da hidratação: como este HTML é
// prerenderizado em /app-shell, o roteador do Nuxt reconcilia a barra de endereço
// com o `payload.path` do HTML (createCurrentLocation, em
// nuxt/pages/runtime/plugins/router) e reescreve o caminho para /app-shell — o
// destino original (ex.: /login/waiting) seria perdido e todo mundo cairia em
// /trabalho. Este script inline roda no parse do documento, antes do bundle,
// então ainda enxerga a URL de verdade.
useHead({
  script: [
    {
      key: 'app-shell-target',
      innerHTML: 'window.__shellTarget__=location.pathname+location.search+location.hash',
      tagPosition: 'head',
    },
  ],
})

onMounted(() => {
  const requested = (window as unknown as { __shellTarget__?: string }).__shellTarget__
  const { pathname, search, hash } = window.location
  const target = requested || `${pathname}${search}${hash}`
  // /app-shell não é uma rota de verdade: só é atingida diretamente (ou quando a
  // captura acima falhou). Aí sim o destino padrão é o app.
  const path = target.split(/[?#]/)[0]
  navigateTo(path === '/app-shell' ? '/trabalho' : target, { replace: true })
})
</script>

<template>
  <div class="shell">
    <img src="/logo-comando.svg" alt="Comando" class="shell-logo" width="140" height="40" >
    <span class="shell-spinner" aria-hidden="true" />
    <p class="shell-text">Carregando…</p>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: #f5f5f7;
}
.shell-logo {
  height: 36px;
  width: auto;
  opacity: 0.9;
}
.shell-spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid rgba(0, 0, 0, 0.12);
  border-top-color: var(--accent);
  animation: shell-spin 0.7s linear infinite;
}
.shell-text {
  font-size: 13px;
  color: #86868b;
  margin: 0;
}
@keyframes shell-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

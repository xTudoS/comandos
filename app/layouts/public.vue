<script setup lang="ts">
// Layout público (sem sidebar) para páginas de apresentação — landing.
// Full-viewport, rolável. Fundo claro com um mesh lavanda/rosa sutil
// (linguagem visual "Milestone": lavanda no topo, rosa de destaque).
</script>

<template>
  <div class="public-shell">
    <div class="mesh" aria-hidden="true">
      <div class="blob blob-1" />
      <div class="blob blob-2" />
      <div class="blob blob-3" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.public-shell {
  position: relative;
  min-height: 100dvh;
  background: var(--surface);
  color: var(--text);
  overflow-x: hidden;
}

.mesh {
  position: absolute;
  inset: 0 0 auto 0;
  height: 900px;
  pointer-events: none;
  z-index: 0;
}

.blob {
  position: absolute;
  border-radius: 50%;
}

/* lavanda — banha o topo/hero */
.blob-1 {
  width: 900px;
  height: 900px;
  top: -420px;
  left: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle at 50% 50%, #ede9fe 0%, transparent 62%);
  opacity: 0.9;
  filter: blur(40px);
}

/* rosa suave à direita */
.blob-2 {
  width: 560px;
  height: 560px;
  top: -80px;
  right: -180px;
  background: radial-gradient(circle at 60% 40%, #fce7ef 0%, transparent 65%);
  opacity: 0.7;
  filter: blur(60px);
}

/* violeta suave à esquerda */
.blob-3 {
  width: 520px;
  height: 520px;
  top: 60px;
  left: -200px;
  background: radial-gradient(circle at 40% 60%, #e0e7ff 0%, transparent 66%);
  opacity: 0.6;
  filter: blur(70px);
}
</style>

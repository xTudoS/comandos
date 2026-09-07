<script setup lang="ts">
// AppPanel — per design-spec-comando.md §8.3
//
// Wrapper para um painel da view /trabalho. Sticky head com frosted-bg,
// scroll interno no body. NÃO usar como container das views clean (full-width).

interface Props {
  titulo: string
  sub?: string
  panelKey?: string // data-panel="..."
  activeMobile?: boolean
}

defineProps<Props>()
</script>

<template>
  <section
    class="panel"
    :class="{ 'is-active-mobile': activeMobile }"
    :data-panel="panelKey"
  >
    <div class="panel-head">
      <div class="panel-head__text">
        <h2 class="panel-head__title">{{ titulo }}</h2>
        <div v-if="sub" class="panel-head__sub">{{ sub }}</div>
      </div>
      <div v-if="$slots['head-action']" class="panel-head__action">
        <slot name="head-action" />
      </div>
    </div>
    <div class="panel-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: var(--color-bg);
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.panel-head {
  position: sticky;
  top: 0;
  background: rgba(245, 245, 247, 0.92);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  z-index: 5;
}

.panel-head__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-head__title {
  margin: 0;
  font-size: var(--fs-13);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-h-tab);
  color: var(--color-text);
}

.panel-head__sub {
  font-size: var(--fs-11);
  color: var(--color-text-3);
  margin-top: 1px;
}

.panel-head__action {
  flex: 0 0 auto;
}

.panel-body {
  padding: 12px 16px 40px;
  flex: 1;
}

/* Mobile: ensure painel-body doesn't sit behind AppMobileTabs (spec §13). */
@media (max-width: 780px) {
  .panel-body {
    padding-bottom: 80px;
  }
}
</style>

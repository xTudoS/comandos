<script setup lang="ts">
// Phase 1: monta singletons globais (toast / confirm / tooltip).
// Todos usam <Teleport to="body"> — não interferem em NuxtLayout/NuxtPage.
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToast />
  <AppConfirm />
  <BaseTooltip />
  <AppOfflineBadge />
  <AppOfflineReady />
  <AppSyncStatus />
</template>

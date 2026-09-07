<script setup lang="ts">
// AppConfirm — single instance backed by useConfirm()
//
// Renderizar UMA vez em layouts/default.vue. Para abrir, qualquer componente
// chama `useConfirm().ask('texto', () => {...})`.

// AppModal vem de @comando/ui (packages/ui) via auto-import do layer.
import { useConfirm } from '~/composables/useConfirm'
const { state, _resolveOk, _resolveCancel } = useConfirm()
</script>

<template>
  <AppModal
    :open="state.open"
    :titulo="state.titulo"
    :max-width="420"
    :close-on-backdrop="false"
    @update:open="(v) => !v && _resolveCancel()"
    @close="_resolveCancel"
  >
    <p class="confirm__msg">{{ state.mensagem }}</p>
    <template #actions>
      <BaseButton variant="ghost" @click="_resolveCancel">{{ state.cancelLabel }}</BaseButton>
      <BaseButton :variant="state.okClass" @click="_resolveOk">{{ state.okLabel }}</BaseButton>
    </template>
  </AppModal>
</template>

<style scoped>
.confirm__msg {
  margin: 0;
  font-size: var(--fs-14);
  color: var(--color-text);
  line-height: var(--lh-base);
  white-space: pre-line;
}
</style>

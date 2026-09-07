<script setup lang="ts">
// BaseFieldRow — per design-spec-comando.md §6.10
//
// Grid de 2 ou 3 colunas para conjuntos de fields lado-a-lado em modais.

interface Props {
  cols?: 2 | 3
  gap?: number
}

withDefaults(defineProps<Props>(), {
  cols: 2,
  gap: 12,
})
</script>

<template>
  <div class="field-row" :style="{ gridTemplateColumns: `repeat(${cols},1fr)`, gap: `${gap}px` }">
    <slot />
  </div>
</template>

<style scoped>
.field-row {
  display: grid;
}

@media (max-width: 640px) {
  .field-row {
    grid-template-columns: 1fr !important;
  }
}
</style>

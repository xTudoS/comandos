<script setup lang="ts">
// BaseWarning — per design-spec-comando.md §8.7
//
// Warning box amber. Conteúdo via slot (geralmente <strong> + texto).
</script>

<template>
  <div class="warning" role="note">
    <slot />
  </div>
</template>

<style scoped>
.warning {
  background: #fef7e6;
  border: 1px solid #f5d778;
  color: #7c5a00;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--fs-12);
  line-height: 1.5;
}
</style>

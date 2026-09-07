<script setup lang="ts">
// BaseField — per design-spec-comando.md §6.10
//
// Wrapper de campo: label uppercase + slot + hint. Ideal pra modais.

interface Props {
  label?: string
  hint?: string
  required?: boolean
  for_?: string // id do input para <label for>
}

defineProps<Props>()
</script>

<template>
  <div class="field">
    <label v-if="label" class="field__label" :for="for_">
      {{ label }}<span v-if="required" class="field__req" aria-hidden="true">*</span>
    </label>
    <slot />
    <div v-if="hint" class="field__hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.field {
  display: block;
}

.field__label {
  display: block;
  font-size: var(--fs-11);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-uppercase);
  color: var(--color-text-3);
  margin-bottom: 6px;
}

.field__req {
  margin-left: 4px;
  color: var(--color-danger);
}

.field__hint {
  margin-top: 4px;
  font-size: var(--fs-11);
  color: var(--color-text-3);
  line-height: 1.4;
}
</style>

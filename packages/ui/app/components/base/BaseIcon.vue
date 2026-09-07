<script setup lang="ts">
// BaseIcon — per design-spec-comando.md §6.12
//
// Wrapper sobre lucide-vue-next. Aceita `name` em kebab-case OU PascalCase.
// Usar APENAS este componente para qualquer ícone — nenhum emoji estrutural.
//
// Uso:
//   <BaseIcon name="x" :size="16"/>
//   <BaseIcon name="chevron-down"/>
//   <BaseIcon name="hourglass" :size="14"/>

import { computed } from 'vue'
import * as lucide from '@lucide/vue'

interface Props {
  name: string
  size?: number | string
  strokeWidth?: number
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
  strokeWidth: 2,
})

function toPascal(name: string): string {
  return name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

const Icon = computed(() => {
  const pascal = toPascal(props.name)
  // lucide exposes each icon as PascalCase.
  // Fall back to a question-mark placeholder if not found.
  const candidate = (lucide as Record<string, unknown>)[pascal]
  return candidate ?? (lucide as Record<string, unknown>)['HelpCircle']
})

const ariaProps = computed(() =>
  props.ariaLabel
    ? { 'aria-label': props.ariaLabel, role: 'img' }
    : { 'aria-hidden': 'true' },
)
</script>

<template>
  <component
    :is="Icon"
    :size="size"
    :stroke-width="strokeWidth"
    v-bind="ariaProps"
  />
</template>

<script setup lang="ts">
// BaseProgressBar — per design-spec-comando.md §6.7
//
// Tones:
//   default  — sólido --color-success (task/projeto/meta default em progresso)
//   zero     — track neutro 30% opacity (vazio mas sinalizando rail)
//   full     — gradient azul iOS (100%)
//   vencida  — gradient vermelho (meta vencida)
//   meta     — gradient azul iOS para metas em progresso parcial

import { computed } from 'vue'

type Tone = 'default' | 'zero' | 'full' | 'vencida' | 'meta'

interface Props {
  value: number // 0..100
  height?: 3 | 4 | 6
  tone?: Tone
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: 3,
  tone: 'default',
})

const clamped = computed(() => Math.max(0, Math.min(100, props.value || 0)))

const fillStyle = computed(() => {
  if (props.tone === 'zero') {
    return {
      width: '100%',
      background: 'var(--color-border-strong)',
      opacity: '0.3',
    }
  }
  if (props.tone === 'full') {
    return {
      width: `${clamped.value}%`,
      background:
        'linear-gradient(90deg, var(--color-progresso-full-from), var(--color-progresso-full-to))',
    }
  }
  if (props.tone === 'vencida') {
    return {
      width: `${clamped.value}%`,
      background:
        'linear-gradient(90deg, var(--color-meta-vencida-from), var(--color-meta-vencida-to))',
    }
  }
  if (props.tone === 'meta') {
    return {
      width: `${clamped.value}%`,
      background:
        'linear-gradient(90deg, var(--color-meta-from), var(--color-meta-to))',
    }
  }
  // default
  return {
    width: `${clamped.value}%`,
    background:
      'linear-gradient(90deg, var(--color-progresso-from), var(--color-progresso-to))',
  }
})
</script>

<template>
  <div
    class="bar"
    :class="`bar--h-${height}`"
    role="progressbar"
    :aria-valuenow="clamped"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="ariaLabel"
  >
    <div class="bar__fill" :style="fillStyle" />
  </div>
</template>

<style scoped>
.bar {
  position: relative;
  width: 100%;
  background: var(--color-border);
  border-radius: 999px;
  overflow: hidden;
}

.bar--h-3 {
  height: 3px;
}
.bar--h-4 {
  height: 4px;
}
.bar--h-6 {
  height: 6px;
}

.bar__fill {
  height: 100%;
  border-radius: inherit;
  transition: width var(--dur-slow) var(--easing-ease-out);
}
</style>

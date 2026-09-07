<script setup lang="ts">
const props = defineProps<{
  /** Índice do passo atual, base 0. */
  current: number
  /** Rótulo de cada passo, na ordem. O comprimento define o nº de segmentos. */
  labels: readonly string[]
}>()

const emit = defineEmits<{ go: [index: number] }>()

const ariaLabel = computed(
  () => `Passo ${props.current + 1} de ${props.labels.length}: ${props.labels[props.current]}`,
)

/** Só dá para voltar. Pular adiante burlaria a validação de cada passo. */
function onPick(i: number) {
  if (i < props.current) emit('go', i)
}
</script>

<template>
  <div class="steps" :aria-label="ariaLabel" role="group">
    <button
      v-for="(label, i) in labels"
      :key="label"
      type="button"
      class="seg"
      :class="{ done: i < current, active: i === current }"
      :disabled="i >= current"
      :aria-label="`Voltar para: ${label}`"
      @click="onPick(i)"
    />
    <span class="sr-only">{{ ariaLabel }}</span>
  </div>
</template>

<style scoped>
/* O padding do container é o que dá alvo de toque aos segmentos: a barra
   desenha 4px, mas a faixa clicável tem 24px e fica DENTRO da caixa do
   componente. Expandir o alvo com um pseudo-elemento negativo colocaria uma
   camada invisível por cima do conteúdo logo abaixo, engolindo cliques. */
.steps {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 0;
}
.seg {
  flex: 1;
  height: 4px;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--border);
  transition: background var(--dur-base) var(--ease-spring);
}
.seg.done,
.seg.active {
  background: var(--accent);
}
/* Concluído é clicável; o atual e os futuros não. */
.seg.done {
  cursor: pointer;
}
.seg.done:hover {
  background: var(--accent-hover);
}
.seg:disabled {
  cursor: default;
}
/* Só o segmento concluído é clicável, e só ele estica o alvo — dentro do
   padding do container, nunca por cima do conteúdo. */
.seg.done {
  position: relative;
}
.seg.done::before {
  content: '';
  position: absolute;
  inset: -10px 0;
}
</style>

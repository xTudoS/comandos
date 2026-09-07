<script setup lang="ts">
import { HORIZONTES, horizonDbToUI, type HorizonDb } from '~/utils/horizontes'
import type { SuggestionFields, TaskSuggestion } from '~/composables/useTaskSuggestion'

/**
 * A faixa de sugestão dentro do modal de tarefa.
 *
 * Regra do produto: **sugerir e confirmar, nunca preencher direto.** Campo
 * errado preenchido sozinho é pior que campo vazio — o vazio a pessoa vê, o
 * errado ela só descobre quando já confiou nele. Por isso nada é aplicado até
 * alguém clicar.
 *
 * Quando a IA não teve certeza, ela pergunta em vez de chutar; as perguntas
 * aparecem aqui como escolha, e a resposta vira a aplicação daquele campo.
 */
const props = defineProps<{
  suggestion: TaskSuggestion
  loading?: boolean
}>()

const emit = defineEmits<{
  apply: [fields: SuggestionFields]
  dismiss: []
  answer: [field: string, value: string]
}>()

const TYPE_LABEL: Record<string, string> = {
  ceo: 'CEO',
  delegate: 'Delego',
  personal: 'Pessoal',
}
const AREA_LABEL: Record<string, string> = {
  corpo: 'Corpo',
  mente: 'Mente',
  relacionamentos: 'Relacionamentos',
  recursos: 'Recursos',
  experiencias: 'Experiências',
}

function horizonLabel(id: string): string {
  const ui = horizonDbToUI[id as HorizonDb] ?? id
  return HORIZONTES.find((h) => h.id === ui)?.label ?? id
}

/** Só os campos que dá para explicar em uma linha. Ids ficam de fora: "vincular
 *  ao projeto 4f2a…" não significa nada para quem lê. */
const chips = computed(() => {
  const f = props.suggestion.fields
  const out: { key: string; label: string }[] = []
  if (f.horizon) out.push({ key: 'horizon', label: horizonLabel(f.horizon) })
  if (f.type) out.push({ key: 'type', label: TYPE_LABEL[f.type] ?? f.type })
  if (f.isMicro) out.push({ key: 'isMicro', label: 'Micro' })
  if (f.lifeArea) out.push({ key: 'lifeArea', label: AREA_LABEL[f.lifeArea] ?? f.lifeArea })
  if (f.scheduledDate) {
    const [y, m, d] = f.scheduledDate.split('-')
    out.push({
      key: 'scheduledDate',
      label: `${d}/${m}/${y}${f.scheduledTime ? ` ${f.scheduledTime}` : ''}`,
    })
  }
  if (f.durationMinutes) out.push({ key: 'durationMinutes', label: `${f.durationMinutes} min` })
  return out
})
</script>

<template>
  <div class="sug">
    <div class="sug-head">
      <BaseIcon name="sparkles" :size="14" />
      <span class="sug-title">Sugestão da IA</span>
      <button type="button" class="sug-x" aria-label="Dispensar sugestão" @click="emit('dismiss')">
        <BaseIcon name="x" :size="14" />
      </button>
    </div>

    <p v-if="suggestion.reasoning" class="sug-why">{{ suggestion.reasoning }}</p>

    <div v-if="chips.length" class="sug-chips">
      <span v-for="c in chips" :key="c.key" class="sug-chip">{{ c.label }}</span>
    </div>

    <!-- "Na dúvida ela pode perguntar": a IA não chutou, então quem decide é o
         usuário — e a resposta aplica só aquele campo. -->
    <div v-for="q in suggestion.questions" :key="q.field" class="sug-q">
      <span class="sug-q-text">{{ q.question }}</span>
      <div v-if="q.options.length" class="sug-q-opts">
        <button
          v-for="o in q.options"
          :key="o"
          type="button"
          class="sug-opt"
          @click="emit('answer', q.field, o)"
        >
          {{ o }}
        </button>
      </div>
    </div>

    <div v-if="chips.length" class="sug-actions">
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="loading"
        @click="emit('apply', suggestion.fields)"
      >
        Aplicar sugestão
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.sug {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--accent-ring);
  border-radius: var(--radius);
  background: var(--accent-soft);
}
.sug-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
}
.sug-title {
  font-size: var(--fs-12);
  font-weight: var(--fw-semibold);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  flex: 1;
}
.sug-x {
  border: 0;
  background: none;
  padding: 2px;
  color: var(--text-3);
  cursor: pointer;
  line-height: 0;
}
.sug-x:hover {
  color: var(--text);
}
.sug-why {
  font-size: var(--fs-12);
  color: var(--text-2);
  margin: 0;
  line-height: 1.5;
}
.sug-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sug-chip {
  font-size: var(--fs-11);
  font-weight: var(--fw-medium);
  color: var(--accent);
  background: var(--surface);
  border: 1px solid var(--accent-ring);
  border-radius: var(--radius-pill);
  padding: 2px 10px;
}
.sug-q {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sug-q-text {
  font-size: var(--fs-12);
  color: var(--text);
}
.sug-q-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sug-opt {
  font-size: var(--fs-11);
  color: var(--text-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 4px 10px;
  cursor: pointer;
}
.sug-opt:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.sug-actions {
  display: flex;
  gap: 6px;
}
</style>

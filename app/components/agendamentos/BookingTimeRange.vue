<script setup lang="ts">
import {
  MIN_RANGE_MIN,
  fitsInFreeRange,
  formatDuration,
  timeToMin,
  type TimeRange,
} from '~~/shared/bookingRanges'

const props = defineProps<{
  start: string
  end: string
  /** Faixas livres do dia, para validar a colisão sem ida ao servidor. */
  ranges: TimeRange[]
}>()

const emit = defineEmits<{
  'update:start': [value: string]
  'update:end': [value: string]
}>()

/**
 * Valida no `blur`, não a cada tecla: um `<input type="time">` passa por estados
 * incompletos enquanto a pessoa digita, e acusar erro em cima deles é ruído.
 */
const touched = ref(false)

const durationMin = computed(() => timeToMin(props.end) - timeToMin(props.start))

const error = computed(() => {
  if (!props.start || !props.end) return ''
  if (durationMin.value < MIN_RANGE_MIN) return 'O fim precisa ser depois do início.'
  if (!fitsInFreeRange({ start: timeToMin(props.start), end: timeToMin(props.end) }, props.ranges)) {
    return 'Esse intervalo colide com um compromisso. Escolha outro período.'
  }
  return ''
})

/** Erro só aparece depois que a pessoa saiu do campo pelo menos uma vez. */
const shownError = computed(() => (touched.value ? error.value : ''))
</script>

<template>
  <div class="range-fields">
    <BaseFieldRow :cols="2">
      <BaseField label="Início" required>
        <BaseInput
          :model-value="start"
          type="time"
          aria-label="Horário de início"
          @update:model-value="emit('update:start', $event)"
          @blur="touched = true"
        />
      </BaseField>
      <BaseField label="Fim" required>
        <BaseInput
          :model-value="end"
          type="time"
          aria-label="Horário de fim"
          @update:model-value="emit('update:end', $event)"
          @blur="touched = true"
        />
      </BaseField>
    </BaseFieldRow>

    <p v-if="shownError" class="err" role="alert">{{ shownError }}</p>
    <p v-else-if="durationMin > 0" class="dur tabular">
      Duração: {{ formatDuration(durationMin) }}
    </p>
  </div>
</template>

<style scoped>
.range-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dur {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  margin: 0;
}
.err {
  font-size: 13px;
  color: var(--danger);
  margin: 0;
  line-height: 1.4;
}
</style>

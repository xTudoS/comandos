<script setup lang="ts">
import { formatDuration, timeToMin, type TimeRange } from '~~/shared/bookingRanges'

const props = withDefaults(
  defineProps<{
    ranges: TimeRange[]
    loading?: boolean
    error?: string
    /** Intervalo escolhido agora, para marcar a faixa correspondente. */
    start?: string
    end?: string
  }>(),
  { loading: false, error: '', start: '', end: '' },
)

const emit = defineEmits<{ pick: [range: TimeRange] }>()

function lengthOf(r: TimeRange): string {
  return formatDuration(timeToMin(r.end) - timeToMin(r.start))
}

/**
 * A faixa fica marcada enquanto o intervalo escolhido couber dentro dela. Assim
 * que a pessoa edita os campos para algo que não bate, o destaque sai — a marca
 * não pode dizer "você escolheu isto" quando não é verdade.
 */
function isCurrent(r: TimeRange): boolean {
  if (!props.start || !props.end) return false
  const s = timeToMin(props.start)
  const e = timeToMin(props.end)
  return e > s && timeToMin(r.start) <= s && e <= timeToMin(r.end)
}
</script>

<template>
  <div class="free">
    <p v-if="loading" class="hint">Carregando períodos livres…</p>
    <p v-else-if="error" class="err" role="alert">{{ error }}</p>
    <BaseEmptyState
      v-else-if="!ranges.length"
      icon="calendar-x"
      message="Nenhum horário livre nesta data."
    />
    <template v-else>
      <ul class="list">
        <li v-for="r in ranges" :key="`${r.start}-${r.end}`">
          <button
            type="button"
            class="range tabular"
            :class="{ current: isCurrent(r) }"
            :aria-label="`Usar o período das ${r.start} às ${r.end}`"
            @click="emit('pick', r)"
          >
            <span class="span">{{ r.start }} – {{ r.end }}</span>
            <span class="len">{{ lengthOf(r) }}</span>
          </button>
        </li>
      </ul>
      <p class="hint">
        Só aparecem os períodos livres. O que não está na lista já está ocupado.
      </p>
    </template>
  </div>
</template>

<style scoped>
.free {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.range {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  /* 44px de alvo de toque vêm daqui, não de uma altura fixa: com Dynamic Type
     grande o texto cresce e o botão acompanha em vez de cortar. */
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--dur-fast),
    background var(--dur-fast);
}
.range:hover {
  border-color: var(--accent);
}
.range.current {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.span {
  font-size: 15px;
  font-weight: 600;
  color: var(--accent);
}
.len {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
  flex: none;
}
.hint {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.5;
}
.err {
  font-size: 13px;
  color: var(--danger);
  margin: 0;
}
</style>

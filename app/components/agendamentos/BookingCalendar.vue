<script setup lang="ts">
import { DOW_SHORT, MESES, addDays, addMonths, fmtDate, sameDay } from '~/utils/dates'

// Não há mais dia "sem disponibilidade": todo dia a partir de `minDate` é
// selecionável, e é a lista de faixas livres do passo seguinte que conta a
// história de quanto sobrou naquele dia.
const props = defineProps<{
  /** Data selecionada em YYYY-MM-DD ('' = nenhuma). */
  modelValue: string
  /** Menor data selecionável (YYYY-MM-DD). Dias anteriores ficam desabilitados. */
  minDate: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const minDay = computed(() => {
  const d = new Date(props.minDate + 'T12:00:00')
  d.setHours(0, 0, 0, 0)
  return d
})

// Cursor de mês: parte do mês da data selecionada, senão do mês da data mínima.
const cursor = ref<Date>(startMonth(props.modelValue || props.minDate))

function startMonth(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) cursor.value = startMonth(v)
  },
)

const monthLabel = computed(
  () => `${MESES[cursor.value.getMonth()]} ${cursor.value.getFullYear()}`,
)

// Não deixa navegar para meses inteiramente no passado.
const canGoPrev = computed(() => {
  const prev = addMonths(cursor.value, -1)
  const lastOfPrev = new Date(prev.getFullYear(), prev.getMonth() + 1, 0)
  return lastOfPrev.getTime() >= minDay.value.getTime()
})

function goPrev() {
  if (canGoPrev.value) cursor.value = addMonths(cursor.value, -1)
}
function goNext() {
  cursor.value = addMonths(cursor.value, 1)
}

type Cell = {
  date: Date
  key: string
  day: number
  outside: boolean
  selectable: boolean
  selected: boolean
}

function isSelectable(d: Date, outside: boolean): boolean {
  if (outside) return false
  return d.getTime() >= minDay.value.getTime()
}

const cells = computed<Cell[]>(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = addDays(start, i)
    const outside = d.getMonth() !== cursor.value.getMonth()
    const key = fmtDate(d)
    return {
      date: d,
      key,
      day: d.getDate(),
      outside,
      selectable: isSelectable(d, outside),
      selected: !!props.modelValue && sameDay(d, props.modelValue),
    }
  })
})

function onPick(c: Cell) {
  if (!c.selectable) return
  emit('update:modelValue', c.key)
}
</script>

<template>
  <div class="cal">
    <div class="head">
      <span class="label">{{ monthLabel }}</span>
      <div class="head-nav">
        <button
          type="button"
          class="nav"
          :disabled="!canGoPrev"
          aria-label="Mês anterior"
          @click="goPrev"
        >
          <BaseIcon name="chevron-left" :size="16" />
        </button>
        <button type="button" class="nav" aria-label="Próximo mês" @click="goNext">
          <BaseIcon name="chevron-right" :size="16" />
        </button>
      </div>
    </div>
    <div class="dow">
      <span v-for="(d, i) in DOW_SHORT" :key="i">{{ d }}</span>
    </div>
    <div class="grid">
      <button
        v-for="c in cells"
        :key="c.key"
        type="button"
        class="cell"
        :class="{
          outside: c.outside,
          selected: c.selected,
          disabled: !c.selectable,
        }"
        :disabled="!c.selectable"
        @click="onPick(c)"
      >
        <span class="num">{{ c.day }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cal {
  font-variant-numeric: tabular-nums;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.head .label {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.015em;
  text-transform: capitalize;
  color: var(--text);
}
.head-nav {
  display: flex;
  gap: 2px;
}
.nav {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.nav:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.dow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  font-size: 10px;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  text-align: center;
  padding: 2px 0 8px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px 2px;
}
.cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  color: var(--text);
  position: relative;
  background: transparent;
}
.cell .num {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  max-width: 100%;
  max-height: 100%;
  border-radius: 50%;
  font-weight: 600;
  transition:
    background var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
}

/* Dias selecionáveis: destaque suave no accent + fundo soft */
.cell:not(.disabled) .num {
  background: var(--accent-soft);
  color: var(--accent);
}
.cell:not(.disabled):hover .num {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.cell.disabled {
  cursor: default;
  color: var(--text-4);
}
.cell.disabled.outside {
  color: transparent;
}

.cell.selected .num {
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 700;
}
.cell.selected:hover .num {
  background: var(--accent-hover);
}
</style>

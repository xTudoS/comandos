<script setup lang="ts">
// Calendário mensal de metas — cada meta aparece no dia do seu `prazo`.
// Componente próprio (o AgendaCalendar é acoplado a tarefas). Cor por status.
import type { Meta, StatusMeta } from '~/types/meta'
import { DOW_SHORT, MESES, addDays, addMonths, fmtDate, sameDay } from '~/utils/dates'

const props = defineProps<{
  items: { meta: Meta; status: StatusMeta }[]
}>()
const emit = defineEmits<{ open: [Meta] }>()

const cursor = ref<Date>(startOfMonth(new Date()))
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
const monthLabel = computed(() => `${MESES[cursor.value.getMonth()]} ${cursor.value.getFullYear()}`)
const isCurrentMonth = computed(() => sameMonth(cursor.value, new Date()))

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}
function goPrev() { cursor.value = addMonths(cursor.value, -1) }
function goNext() { cursor.value = addMonths(cursor.value, 1) }
function goToday() { cursor.value = startOfMonth(new Date()) }

// Metas por dia (chave YYYY-MM-DD do prazo).
const byDay = computed(() => {
  const m = new Map<string, { meta: Meta; status: StatusMeta }[]>()
  for (const it of props.items) {
    if (!it.meta.prazo) continue
    const arr = m.get(it.meta.prazo) ?? []
    arr.push(it)
    m.set(it.meta.prazo, arr)
  }
  return m
})
// Metas sem prazo — listadas fora da grade (não têm dia onde cair).
const semPrazo = computed(() => props.items.filter((it) => !it.meta.prazo))

type Cell = { key: string; day: number; outside: boolean; isToday: boolean }
const cells = computed<Cell[]>(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  const today = new Date()
  return Array.from({ length: 42 }, (_, i) => {
    const d = addDays(start, i)
    return {
      key: fmtDate(d),
      day: d.getDate(),
      outside: d.getMonth() !== cursor.value.getMonth(),
      isToday: sameDay(d, today),
    }
  })
})
</script>

<template>
  <div class="mcal">
    <div class="mcal-head">
      <span class="mcal-month">{{ monthLabel }}</span>
      <div class="mcal-nav">
        <button type="button" class="mcal-today" :disabled="isCurrentMonth" @click="goToday">Hoje</button>
        <button type="button" class="mcal-btn" aria-label="Mês anterior" @click="goPrev">
          <BaseIcon name="chevron-left" :size="17" />
        </button>
        <button type="button" class="mcal-btn" aria-label="Próximo mês" @click="goNext">
          <BaseIcon name="chevron-right" :size="17" />
        </button>
      </div>
    </div>

    <div class="mcal-dow">
      <span v-for="(d, i) in DOW_SHORT" :key="i">{{ d }}</span>
    </div>

    <div class="mcal-grid">
      <div
        v-for="c in cells"
        :key="c.key"
        class="mcal-cell"
        :class="{ outside: c.outside, today: c.isToday }"
      >
        <span class="mcal-num">{{ c.day }}</span>
        <div class="mcal-events">
          <button
            v-for="it in byDay.get(c.key) ?? []"
            :key="it.meta.id"
            type="button"
            class="mcal-ev"
            :class="`st-${it.status}`"
            :title="it.meta.titulo"
            @click="emit('open', it.meta)"
          >
            <span class="mcal-ev-dot" />
            <span class="mcal-ev-title">{{ it.meta.titulo }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="semPrazo.length" class="mcal-noprazo">
      <span class="mcal-noprazo-label">Sem prazo</span>
      <div class="mcal-noprazo-list">
        <button
          v-for="it in semPrazo"
          :key="it.meta.id"
          type="button"
          class="mcal-ev"
          :class="`st-${it.status}`"
          @click="emit('open', it.meta)"
        >
          <span class="mcal-ev-dot" />
          <span class="mcal-ev-title">{{ it.meta.titulo }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcal {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  padding: 14px 16px 16px;
}
.mcal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.mcal-month {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-transform: capitalize;
  color: var(--text);
}
.mcal-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mcal-today {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.mcal-today:hover:not(:disabled) { background: var(--surface-hover); }
.mcal-today:disabled {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
  cursor: default;
}
.mcal-btn {
  height: 32px;
  width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
}
.mcal-btn:hover { background: var(--surface-hover); color: var(--text); }
.mcal-dow {
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
.mcal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.mcal-cell {
  min-height: 92px;
  border: 1px solid var(--border-faint);
  border-radius: var(--radius-sm);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface);
}
.mcal-cell.outside { background: var(--surface-alt); opacity: 0.6; }
.mcal-cell.today { border-color: var(--accent); }
.mcal-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.mcal-cell.today .mcal-num { color: var(--accent); }
.mcal-events {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}
.mcal-ev {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
}
.mcal-ev:hover { background: var(--surface-alt); }
.mcal-ev-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--accent);
}
.mcal-ev.st-vencida .mcal-ev-dot { background: var(--danger); }
.mcal-ev.st-concluida .mcal-ev-dot { background: var(--success); }
.mcal-ev-title {
  font-size: 11px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcal-noprazo {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.mcal-noprazo-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
}
.mcal-noprazo-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.mcal-noprazo-list .mcal-ev { width: auto; }

@media (max-width: 640px) {
  .mcal-cell { min-height: 64px; }
  .mcal-ev-title { display: none; }
}
</style>

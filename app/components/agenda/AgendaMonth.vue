<script setup lang="ts">
import type { AgendaItem } from '~~/shared/agendaItem'
import type { AgendaRange } from '~/composables/useAgendaWindow'
import { groupAgendaItemsByDay } from '~~/shared/agendaSort'
import { addDays, fmtDate, sameDay } from '~/utils/dates'
import AgendaEventCard from '~/components/agenda/AgendaEventCard.vue'

const props = defineProps<{ range: AgendaRange; items: AgendaItem[] }>()
const emit = defineEmits<{
  'select-day': [dateKey: string]
  open: [item: AgendaItem]
}>()

const MAX_PILLS = 3
const WEEK_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const today = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

// Agrupamento e ordenação vêm de `shared/agendaSort`. Este componente tinha a
// TERCEIRA variação da regra de ordenação do app (com-hora antes de sem-hora),
// divergente do servidor e do resto do cliente.
const byDay = computed(() => groupAgendaItemsByDay(props.items))

const anchorMonth = computed(() => props.range.anchor.getMonth())

const cells = computed(() =>
  Array.from({ length: props.range.days }, (_, i) => {
    const d = addDays(props.range.start, i)
    const key = fmtDate(d)
    const dow = d.getDay()
    const list = byDay.value.get(key) ?? []
    return {
      key,
      num: d.getDate(),
      inMonth: d.getMonth() === anchorMonth.value,
      isToday: sameDay(d, today),
      isWeekend: dow === 0 || dow === 6,
      isPast: d < today,
      items: list,
      visible: list.slice(0, MAX_PILLS),
      extra: Math.max(0, list.length - MAX_PILLS),
    }
  }),
)

const rows = computed(() => Math.ceil(props.range.days / 7))
</script>

<template>
  <div class="month">
    <!-- Cabeçalho dos dias da semana (segunda → domingo) -->
    <div class="m-dow">
      <span v-for="(w, i) in WEEK_LABELS" :key="w" class="m-dow-cell" :class="{ weekend: i >= 5 }">
        {{ w }}
      </span>
    </div>

    <!-- Grade -->
    <div class="m-grid" :style="{ gridTemplateRows: `repeat(${rows}, minmax(96px, 1fr))` }">
      <div
        v-for="c in cells"
        :key="c.key"
        class="m-cell"
        :class="{ 'out-month': !c.inMonth, today: c.isToday, weekend: c.isWeekend, past: c.isPast }"
        @click="emit('select-day', c.key)"
      >
        <span class="m-num">{{ c.num }}</span>

        <div class="m-events" @click.stop>
          <button
            v-for="item in c.visible"
            :key="item.id"
            type="button"
            class="m-pill"
            @click="emit('open', item)"
          >
            <AgendaEventCard :item="item" variant="pill" />
          </button>

          <button
            v-if="c.extra > 0"
            type="button"
            class="m-more"
            @click="emit('select-day', c.key)"
          >
            +{{ c.extra }} mais
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.month {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

/* ── Cabeçalho dos dias da semana ── */
.m-dow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.m-dow-cell {
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-2);
  text-align: left;
}
.m-dow-cell.weekend {
  color: var(--text-4);
}

/* ── Grade de dias ── */
.m-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.m-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 8px 10px;
  border-left: 1px solid var(--border-faint);
  border-top: 1px solid var(--border-faint);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
}
/* Remove bordas externas redundantes da 1ª coluna / 1ª linha. */
.m-cell:nth-child(7n + 1) {
  border-left: none;
}
.m-cell:nth-child(-n + 7) {
  border-top: none;
}
.m-cell:hover {
  background: var(--surface-hover);
}
.m-cell.out-month {
  background: color-mix(in srgb, var(--text) 2%, transparent);
}
.m-cell.out-month .m-num {
  color: var(--text-4);
}
.m-cell.weekend:not(.out-month) {
  background: color-mix(in srgb, var(--text) 1.5%, transparent);
}

.m-num {
  align-self: flex-start;
  min-width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: var(--text-2);
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}
/* Hoje: número em círculo preenchido (estilo referência minimalista) */
.m-cell.today .m-num {
  color: var(--accent-fg);
  background: var(--accent);
}

.m-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.m-pill {
  display: block;
  width: 100%;
  text-align: left;
  cursor: pointer;
}
.m-more {
  align-self: flex-start;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  border-radius: 6px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
}
.m-more:hover {
  background: var(--surface-hover);
  color: var(--text);
}

@media (max-width: 720px) {
  .m-dow-cell {
    padding: 8px 6px;
    font-size: 10px;
  }
  .m-cell {
    padding: 6px 4px 8px;
  }
}
</style>

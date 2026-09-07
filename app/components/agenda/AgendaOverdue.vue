<script setup lang="ts">
import type { AgendaItem } from '~~/shared/agendaItem'
import { groupAgendaItemsByDay } from '~~/shared/agendaSort'
import { DOW_FULL, MESES } from '~/utils/dates'
import { formatBRL } from '~/utils/money'

/** Ícone por tom, para os tipos que não têm hora para mostrar no lugar. */
const ICON: Record<string, string> = {
  fup: 'hourglass',
  goal: 'flag',
  project: 'folder',
  'payment-in': 'arrow-down-left',
  'payment-out': 'arrow-up-right',
}
// Visão de atrasados: lista o que já venceu e não foi concluído, agrupado por
// dia (mais antigo → mais recente). Agora inclui meta com prazo vencido e
// pagamento em atraso, não só tarefa — é onde a agenda multi-entidade tem o
// ganho mais imediato. A faixa (7/30 dias ou tudo) é decidida pela página;
// aqui só entra o rótulo do estado vazio.
const props = withDefaults(defineProps<{ items: AgendaItem[]; rangeLabel?: string }>(), {
  rangeLabel: '',
})

const emit = defineEmits<{ open: [item: AgendaItem] }>()

const today = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

// Sem o piso de 7 dias a faixa é aberta, então "há 412 dias" fica ilegível —
// acima de um mês o rótulo passa a contar meses, e acima de um ano, anos.
function agoLabel(days: number): string {
  if (days <= 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  if (days < 365) {
    const m = Math.round(days / 30)
    return m === 1 ? 'há 1 mês' : `há ${m} meses`
  }
  const y = Math.floor(days / 365)
  return y === 1 ? 'há mais de 1 ano' : `há mais de ${y} anos`
}

const groups = computed(() =>
  [...groupAgendaItemsByDay(props.items).entries()].map(([date, items]) => {
    const d = new Date(date + 'T12:00:00')
    const daysAgo = Math.round(
      (today.getTime() - new Date(date + 'T00:00:00').getTime()) / 86_400_000,
    )
    return {
      date,
      label: `${DOW_FULL[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)}`,
      ago: agoLabel(daysAgo),
      items,
    }
  }),
)
</script>

<template>
  <div class="ov">
    <div v-if="groups.length === 0" class="ov-empty">
      <BaseIcon name="party-popper" :size="22" />
      {{ rangeLabel ? `Nada atrasado — ${rangeLabel.toLowerCase()}.` : 'Nada atrasado.' }}
    </div>

    <section v-for="g in groups" :key="g.date" class="ov-group">
      <header class="ov-head">
        <span class="ov-date">{{ g.label }}</span>
        <span class="ov-ago">{{ g.ago }}</span>
      </header>
      <ul class="ov-list">
        <li v-for="item in g.items" :key="item.id">
          <button type="button" class="ov-row" :class="item.tone" @click="emit('open', item)">
            <span class="ov-dot" aria-hidden="true" />
            <span class="ov-time">
              <BaseIcon v-if="item.kind !== 'task'" :name="ICON[item.tone] ?? 'circle'" :size="12" />
              <template v-else-if="item.time">{{ item.time }}</template>
              <template v-else>—</template>
            </span>
            <span class="ov-title">{{ item.title }}</span>
            <span v-if="item.amountCents !== null" class="ov-amount">
              {{ formatBRL(item.amountCents) }}
            </span>
            <AvatarStack
              v-if="item.delegatePersonName"
              :people="[{ name: item.delegatePersonName }]"
              :size="20"
              :max="3"
            />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.ov {
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  padding: 18px 20px;
}
.ov-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  font-size: 13px;
  color: var(--text-3);
}
.ov-empty :deep(svg) {
  color: var(--success);
}

/* ── Grupo por dia ── */
.ov-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ov-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 0 2px 4px;
  border-bottom: 1px solid var(--border-faint);
}
.ov-date {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  text-transform: capitalize;
}
.ov-ago {
  font-size: 12px;
  font-weight: 600;
  color: var(--danger);
}

/* ── Linhas ── */
.ov-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ov-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
}
.ov-row:hover {
  background: var(--surface-hover);
}
.ov-row.ceo {
  --ov-fg: var(--ceo-fg);
}
.ov-row.delegate {
  --ov-fg: var(--delego-fg);
}
.ov-row.personal {
  --ov-fg: var(--pessoal-fg);
}
.ov-row.fup {
  --ov-fg: var(--followup-fg);
}
.ov-row.goal {
  --ov-fg: var(--meta-from);
}
.ov-row.project {
  --ov-fg: var(--proj-empresa-fg);
}
.ov-row.payment-in {
  --ov-fg: var(--pag-pago);
}
.ov-row.payment-out {
  --ov-fg: var(--pag-pendente);
}
/* Vencimento atrasado sem o valor não diz o tamanho do problema. */
.ov-amount {
  font-size: 13px;
  font-weight: 600;
  color: var(--ov-fg);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.ov-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--ov-fg);
}
.ov-time {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 46px;
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, var(--ov-fg) 62%, var(--text-3));
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.ov-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<script setup lang="ts">
// Timeline vertical de metas por prazo — agrupada por mês (cronológica). Metas
// sem prazo caem num grupo final. Cada nó é clicável e colorido por status.
import type { Meta, StatusMeta } from '~/types/meta'
import { MESES } from '~/utils/dates'
import { diasAtePrazo } from '~/composables/useStatus'

const props = defineProps<{
  items: { meta: Meta; status: StatusMeta }[]
}>()
const emit = defineEmits<{ open: [Meta] }>()

type Group = { key: string; label: string; rows: { meta: Meta; status: StatusMeta }[] }

const groups = computed<Group[]>(() => {
  const withPrazo = props.items.filter((it) => it.meta.prazo)
  const semPrazo = props.items.filter((it) => !it.meta.prazo)

  const byMonth = new Map<string, { meta: Meta; status: StatusMeta }[]>()
  for (const it of withPrazo) {
    const key = it.meta.prazo!.slice(0, 7) // YYYY-MM
    const arr = byMonth.get(key) ?? []
    arr.push(it)
    byMonth.set(key, arr)
  }

  const out: Group[] = [...byMonth.keys()]
    .sort()
    .map((key) => {
      const [y, mo] = key.split('-')
      const rows = byMonth
        .get(key)!
        .slice()
        .sort((a, b) => (a.meta.prazo! < b.meta.prazo! ? -1 : a.meta.prazo! > b.meta.prazo! ? 1 : 0))
      return { key, label: `${MESES[Number(mo) - 1] ?? ''} ${y}`, rows }
    })

  if (semPrazo.length) {
    out.push({ key: 'sem-prazo', label: 'Sem prazo', rows: semPrazo })
  }
  return out
})

function dayOf(m: Meta): string {
  if (!m.prazo) return '—'
  const [, , da] = m.prazo.split('-')
  return da ?? '—'
}
function prazoHint(m: Meta): string {
  if (!m.prazo) return ''
  const d = diasAtePrazo(m.prazo)
  if (d === null) return ''
  if (d < 0) return `há ${Math.abs(d)}d`
  if (d === 0) return 'hoje'
  if (d === 1) return 'amanhã'
  return `em ${d}d`
}
</script>

<template>
  <div class="mtl">
    <div v-if="groups.length === 0" class="mtl-empty">Nenhuma meta para exibir.</div>
    <section v-for="g in groups" :key="g.key" class="mtl-group">
      <h3 class="mtl-month">{{ g.label }}</h3>
      <div class="mtl-rail">
        <button
          v-for="it in g.rows"
          :key="it.meta.id"
          type="button"
          class="mtl-row"
          :class="`st-${it.status}`"
          @click="emit('open', it.meta)"
        >
          <span class="mtl-day">{{ dayOf(it.meta) }}</span>
          <span class="mtl-node" />
          <span class="mtl-body">
            <span class="mtl-title">{{ it.meta.titulo }}</span>
            <span class="mtl-meta">
              <span class="mtl-status" :class="`st-${it.status}`">{{ it.status }}</span>
              <span v-if="prazoHint(it.meta)" class="mtl-hint">· {{ prazoHint(it.meta) }}</span>
            </span>
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mtl {
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 720px;
}
.mtl-empty {
  padding: 28px;
  text-align: center;
  font-size: 13px;
  color: var(--text-4);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
}
.mtl-month {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
  margin: 0 0 10px;
}
.mtl-rail {
  display: flex;
  flex-direction: column;
}
.mtl-row {
  display: grid;
  grid-template-columns: 34px 20px 1fr;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 8px 10px 8px 0;
  cursor: pointer;
  position: relative;
  border-radius: var(--radius-md);
  transition: background var(--dur-fast) var(--ease-spring);
}
.mtl-row:hover { background: var(--surface-hover); }
.mtl-day {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-2);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* Trilho vertical contínuo atrás dos nós. */
.mtl-node {
  position: relative;
  width: 20px;
  height: 100%;
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mtl-node::before {
  content: '';
  position: absolute;
  top: -50%;
  bottom: -50%;
  width: 2px;
  background: var(--border);
}
.mtl-node::after {
  content: '';
  position: relative;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--surface);
  z-index: 1;
}
.mtl-row.st-vencida .mtl-node::after { background: var(--danger); }
.mtl-row.st-concluida .mtl-node::after { background: var(--success); }
.mtl-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mtl-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mtl-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-3);
}
.mtl-status {
  text-transform: capitalize;
  font-weight: 600;
}
.mtl-status.st-ativa { color: var(--accent); }
.mtl-status.st-vencida { color: var(--danger); }
.mtl-status.st-concluida { color: var(--success); }
</style>

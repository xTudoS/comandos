<script setup lang="ts">
import { fmtDate } from '~/utils/dates'

type Task = {
  id: string
  done: boolean
  archived: boolean
  type: 'ceo' | 'delegate' | 'personal'
  horizon: 'core7' | 'core30' | 'core60' | 'core90' | 'hibernating'
  scheduledDate: string | null
  followupActive: boolean
  followupDate: string | null
}

const { data } = await useFetch<{ tasks: Task[] }>('/api/tasks', {
  default: () => ({ tasks: [] }),
})

const ativas = computed(() =>
  (data.value?.tasks ?? []).filter((t) => !t.done && !t.archived),
)
const ceo = computed(() => ativas.value.filter((t) => t.type === 'ceo'))
const delego = computed(() => ativas.value.filter((t) => t.type === 'delegate'))
const core30 = computed(() => ativas.value.filter((t) => t.horizon === 'core30'))
const followup = computed(() => ativas.value.filter((t) => t.followupActive))
const hoje = computed(() => {
  const today = fmtDate(new Date())
  return ativas.value.filter((t) =>
    t.followupActive ? t.followupDate === today : t.scheduledDate === today,
  )
})
</script>

<template>
  <div class="kpis">
    <div class="kpi">
      <div class="k-val">{{ ativas.length }}</div>
      <div class="k-lab">Ativas</div>
    </div>
    <div class="kpi ceo">
      <div class="k-val">{{ ceo.length }}</div>
      <div class="k-lab">CEO</div>
    </div>
    <div class="kpi delego">
      <div class="k-val">{{ delego.length }}</div>
      <div class="k-lab">Delego</div>
    </div>
    <div class="kpi core30">
      <div class="k-val">{{ core30.length }}</div>
      <div class="k-lab">30 dias</div>
    </div>
    <div class="kpi followup">
      <div class="k-val">{{ followup.length }}</div>
      <div class="k-lab">Follow-up</div>
    </div>
    <div class="kpi">
      <div class="k-val">{{ hoje.length }}</div>
      <div class="k-lab">Hoje</div>
    </div>
  </div>
</template>

<style scoped>
.kpis {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  overflow-x: auto;
}
.kpi {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.kpi .k-val {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.kpi .k-lab {
  font-size: 10px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}
.kpi.ceo .k-val { color: var(--ceo-fg); }
.kpi.delego .k-val { color: var(--delego-fg); }
.kpi.core30 .k-val { color: var(--amber); }
.kpi.followup .k-val { color: var(--followup-fg); }
@media (max-width: 900px) {
  .kpi.ceo,
  .kpi.delego,
  .kpi.core30,
  .kpi.followup {
    display: none;
  }
}
</style>

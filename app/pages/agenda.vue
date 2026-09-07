<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { MESES, addDays, fmtDate } from '~/utils/dates'
import { useProjetosStore } from '~/stores/projetos'
import { useMetasStore } from '~/stores/metas'
import { filterAgendaItems } from '~/utils/agendaFilter'
import type { AgendaItem } from '~~/shared/agendaItem'
import { OVERDUE_RANGE_DAYS, type AgendaView, type OverdueRange } from '~/composables/useAgendaWindow'

// Janela com chave própria: `/agenda` e `/trabalho` tinham o mesmo `useState`
// sem chave, então navegar uma semana aqui movia a aba Calendário de lá junto.
const { view, offset, range } = useAgendaWindow('agenda', 'week')
const { items: allItems, derive, loading } = useAgendaItems({ range })
const agendaActions = useAgendaActions()

const { refresh: refreshTasks } = useTasks()
const { list: companiesList, refresh: refreshCompanies } = useCompanies()
const { refresh: refreshPayments } = usePayments()
const projetosStore = useProjetosStore()
const metasStore = useMetasStore()
const { list: projetosList } = storeToRefs(projetosStore)

// Não bloqueia a renderização: pinta a página com o que já está em cache e
// busca o resto no mount. Antes, o await de topo suspendia o render via Suspense.
onMounted(() => {
  Promise.all([
    refreshCompanies(),
    refreshTasks(),
    refreshPayments(),
    projetosStore.refresh(),
    metasStore.refresh(),
  ]).catch(() => {})
})

// ── View switching ───────────────────────────────────────
// Modo único do switcher (estilo da referência minimalista). Mês/Semana/Dia
// mapeiam 1:1 para a granularidade do range; "timeline" (Gantt) é a view extra
// e reusa a última granularidade escolhida nela.
type Mode = 'month' | 'week' | 'day' | 'timeline' | 'overdue'
const mode = ref<Mode>('week')
const timelineGranularity = ref<AgendaView>('week')
const isOverdue = computed(() => mode.value === 'overdue')

// Aplica o modo escolhido ao range (via `view`) e volta para o período atual.
// "overdue" tem janela própria (últimos 7 dias, no composable) e não mexe no
// range/granularidade da grade.
function setMode(m: Mode) {
  mode.value = m
  if (m === 'timeline') view.value = timelineGranularity.value
  else if (m !== 'overdue') view.value = m
  offset.value = 0
}
const modeProxy = computed<Mode>({
  get: () => mode.value,
  set: (m) => {
    if (m !== mode.value) setMode(m)
  },
})
// Aplica o modo inicial ao range no primeiro render.
view.value = 'week'

// Mantém a granularidade do Gantt em sincronia quando o usuário a troca lá.
watch(view, (v) => {
  if (mode.value === 'timeline') timelineGranularity.value = v
})

const modeTabs = [
  { value: 'month' as const, label: 'Mês', icon: 'calendar-days' },
  { value: 'week' as const, label: 'Semana', icon: 'calendar-range' },
  { value: 'day' as const, label: 'Dia', icon: 'calendar' },
  { value: 'timeline' as const, label: 'Linha do tempo', icon: 'gantt-chart' },
  { value: 'overdue' as const, label: 'Atrasados', icon: 'calendar-x' },
]
const granularityTabs = [
  { value: 'day' as const, label: 'Dia' },
  { value: 'week' as const, label: 'Semana' },
  { value: 'month' as const, label: 'Mês' },
]
// Faixa da visão de atrasados. Default 'all': o que atrasou há muito tempo é
// justamente o que não pode sumir da tela.
const overdueRangeTabs = [
  { value: '7' as const, label: '7 dias' },
  { value: '30' as const, label: '30 dias' },
  { value: 'all' as const, label: 'Tudo' },
]
const OVERDUE_RANGE_LABEL: Record<string, string> = {
  '7': 'Últimos 7 dias',
  '30': 'Últimos 30 dias',
  all: 'Todos os atrasados',
}

// Vai para a visão de Dia numa data específica (clique numa célula do mês).
function selectDay(dateKey: string) {
  const sel = new Date(dateKey + 'T12:00:00')
  sel.setHours(0, 0, 0, 0)
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  mode.value = 'day'
  view.value = 'day'
  offset.value = Math.round((sel.getTime() - t.getTime()) / 86_400_000)
}

// ── Filters ──────────────────────────────────────────────
const filtroEmpresa = ref<'all' | string>('all')
const filtroTipo = ref<'all' | 'ceo' | 'delegate' | 'personal'>('all')
const search = ref('')
const showDone = ref(true)

const tipoTabs = [
  { value: 'all' as const, label: 'Tudo' },
  { value: 'ceo' as const, label: 'CEO' },
  { value: 'delegate' as const, label: 'Delegado' },
  { value: 'personal' as const, label: 'Pessoal' },
]

const empresaOptions = computed(() => [
  { value: 'all', label: 'Todas as empresas' },
  ...companiesList.value
    .filter((c) => !c.archived)
    .map((c) => ({ value: c.id, label: c.name })),
])

const projectIdsOfCompany = computed(() => {
  if (filtroEmpresa.value === 'all') return null
  return new Set(
    projetosList.value
      .filter((p) => p.company_id === filtroEmpresa.value)
      .map((p) => p.id),
  )
})

// Pipeline de filtros compartilhado com as abas Calendário/Timeline de
// `/trabalho` (~/utils/agendaFilter), que antes tinham um filtro próprio e mais
// fraco. `showDone` é ignorado nos atrasados, que já são só o que está aberto.
function applyFilters(source: AgendaItem[], respectShowDone = true) {
  return filterAgendaItems(source, {
    type: filtroTipo.value,
    company: filtroEmpresa.value,
    companyProjectIds: projectIdsOfCompany.value,
    search: search.value,
    showDone: respectShowDone ? showDone.value : true,
  })
}

const filteredEvents = computed(() => applyFilters(allItems.value))

// ── Atrasados ────────────────────────────────────────────
// Janela própria, derivada do cache local: de "sempre" (ou dos últimos N dias)
// até ontem. Agora inclui meta com prazo vencido e pagamento em atraso — o
// ganho mais imediato da agenda multi-entidade.
const overdueRange = useState<OverdueRange>('agenda:overdueRange', () => 'all')

const overdueItems = computed<AgendaItem[]>(() => {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const to = fmtDate(addDays(t, -1))
  const days = OVERDUE_RANGE_DAYS[overdueRange.value]
  // Sem piso: '0001-01-01' cobre qualquer data anterior possível. Antes a
  // janela era fixa nos últimos 7 dias e o que atrasou há mais tempo sumia.
  const from = days === null ? '0001-01-01' : fmtDate(addDays(t, -days))
  return derive(from, to).filter((i) => !i.done)
})

const filteredOverdue = computed(() => applyFilters(overdueItems.value, false))

// ── Toolbar labels ───────────────────────────────────────
const mkDM = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`

const monthYearLabel = computed(() => {
  const a = range.value.anchor
  return `${MESES[a.getMonth()]} ${a.getFullYear()}`
})
const rangeLabel = computed(() => {
  // No mês, a janela é estendida (semanas completas) — mostra o span real do
  // mês âncora, não os dias vizinhos esmaecidos.
  if (mode.value === 'month') {
    const a = range.value.anchor
    const last = new Date(a.getFullYear(), a.getMonth() + 1, 0)
    return `${mkDM(a)} – ${mkDM(last)}`
  }
  const s = range.value.start
  const e = range.value.end
  if (range.value.days === 1) return mkDM(s)
  return `${mkDM(s)} – ${mkDM(e)}`
})

// Chip de data à esquerda do título (mês abreviado + dia de hoje).
const todayChip = computed(() => {
  const d = new Date()
  return { mon: MESES[d.getMonth()]!.slice(0, 3).toUpperCase(), day: d.getDate() }
})
const isCurrentWindow = computed(() => offset.value === 0)
const eventCount = computed(() =>
  isOverdue.value ? filteredOverdue.value.length : filteredEvents.value.length,
)

function prev() {
  offset.value -= 1
}
function next() {
  offset.value += 1
}
function goToday() {
  offset.value = 0
}
</script>

<template>
  <div class="agenda-page">
    <PageHero
      title="Agenda"
      description="Calendário dos seus compromissos e follow-ups — tudo offline-first."
    >
      <template #actions>
        <label class="ag-search">
          <BaseIcon name="search" :size="15" />
          <input
            v-model="search"
            type="search"
            placeholder="Buscar na agenda…"
            aria-label="Buscar na agenda"
          />
        </label>
      </template>
    </PageHero>

    <!-- Toolbar: chip de data + mês + navegação + switcher de visualização -->
    <div class="ag-toolbar">
      <div class="tb-left">
        <div class="tb-chip" aria-hidden="true">
          <span class="chip-mon">{{ todayChip.mon }}</span>
          <span class="chip-day">{{ todayChip.day }}</span>
        </div>
        <div class="tb-titles">
          <h2 class="tb-month">{{ monthYearLabel }}</h2>
          <p class="tb-range">
            {{ isOverdue ? OVERDUE_RANGE_LABEL[overdueRange] : rangeLabel }} · {{ eventCount }} {{ eventCount === 1 ? 'item' : 'itens' }}
          </p>
        </div>
      </div>

      <div class="tb-right">
        <div v-if="!isOverdue" class="tb-nav">
          <button type="button" class="nav-btn" aria-label="Anterior" @click="prev">
            <BaseIcon name="chevron-left" :size="18" />
          </button>
          <button
            type="button"
            class="tb-today"
            :disabled="isCurrentWindow"
            @click="goToday"
          >
            Hoje
          </button>
          <button type="button" class="nav-btn" aria-label="Próximo" @click="next">
            <BaseIcon name="chevron-right" :size="18" />
          </button>
        </div>
        <ViewTabs v-model="modeProxy" :tabs="modeTabs" aria-label="Visualização" />
      </div>
    </div>

    <!-- Filtros: tipo (segmentado) + granularidade do Gantt + empresa + concluídas -->
    <div class="ag-filters">
      <ViewTabs v-model="filtroTipo" :tabs="tipoTabs" aria-label="Filtrar por tipo" />
      <div class="ag-filters-right">
        <ViewTabs
          v-if="mode === 'timeline'"
          v-model="view"
          :tabs="granularityTabs"
          aria-label="Granularidade"
        />
        <ViewTabs
          v-else-if="isOverdue"
          v-model="overdueRange"
          :tabs="overdueRangeTabs"
          aria-label="Faixa de atraso"
        />
        <label class="filter-control">
          <BaseIcon name="building-2" :size="15" />
          <select v-model="filtroEmpresa" aria-label="Filtrar por empresa">
            <option v-for="o in empresaOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <BaseToggle v-model="showDone" label="Mostrar concluídas" tone="accent" />
      </div>
    </div>

    <div v-if="loading && filteredEvents.length === 0" class="state">
      <span class="spinner" /> Carregando agenda…
    </div>

    <AgendaMonth
      v-if="mode === 'month'"
      :range="range"
      :items="filteredEvents"
      @select-day="selectDay"
      @open="agendaActions.open"
    />
    <AgendaTimeline
      v-else-if="mode === 'timeline'"
      :range="range"
      :items="filteredEvents"
      :view="view"
      @open="agendaActions.open"
      @toggle-done="agendaActions.toggleDone"
    />
    <AgendaOverdue
      v-else-if="mode === 'overdue'"
      :items="filteredOverdue"
      :range-label="OVERDUE_RANGE_LABEL[overdueRange]"
      @open="agendaActions.open"
    />
    <AgendaCalendar
      v-else
      :range="range"
      :items="filteredEvents"
      @open="agendaActions.open"
      @move="agendaActions.move"
    />
  </div>
</template>

<style scoped>
.agenda-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px 26px 60px;
  max-width: 1640px;
  margin: 0 auto;
}

/* ── Filter control ── */
.filter-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-spring);
}
.filter-control:hover {
  border-color: var(--border-strong);
}
.filter-control select {
  border: none;
  background: transparent;
  padding: 0;
  width: auto;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
}
.filter-control select:focus {
  outline: none;
  box-shadow: none;
}

/* ── Busca (no header) ── */
.ag-search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 34px;
  min-width: 220px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-3);
  transition: border-color var(--dur-fast) var(--ease-spring);
}
.ag-search:focus-within {
  border-color: var(--border-strong);
}
.ag-search input {
  border: none;
  background: transparent;
  padding: 0;
  width: 100%;
  font-size: 13px;
  color: var(--text);
}
.ag-search input::placeholder {
  color: var(--text-4);
}
.ag-search input:focus {
  outline: none;
  box-shadow: none;
}

/* ── Toolbar ── */
.ag-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.tb-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
/* Chip de data (estilo referência minimalista) */
.tb-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  flex-shrink: 0;
}
.chip-mon {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-3);
}
.chip-day {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.tb-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tb-month {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--text);
  text-transform: capitalize;
}
.tb-range {
  font-size: 13px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.tb-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.tb-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tb-today {
  height: 34px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.tb-today:hover:not(:disabled) {
  background: var(--surface-hover);
}
.tb-today:disabled {
  color: var(--text-4);
  cursor: default;
}
.nav-btn {
  height: 34px;
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
}
.nav-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

/* ── Filtros ── */
.ag-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ag-filters-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── States ── */
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-3);
}
.state.error {
  color: var(--danger);
}
.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .agenda-page {
    padding: 18px 16px 80px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>

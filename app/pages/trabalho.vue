<script setup lang="ts">
import type { ContextMenuItem } from '#ui/types'
import { HORIZONTES, horizonDbToUI, horizonUIToDb, type HorizonUI } from '~/utils/horizontes'
import { MESES } from '~/utils/dates'
import { compareByDue, dateTimeKey } from '~/utils/taskSort'
import { formatBRL } from '~/utils/money'
import { isOverdue } from '~/utils/overdue'
import type { Task } from '~/composables/useTasks'
import type { AgendaView } from '~/composables/useAgendaWindow'
import type { AgendaItemKind } from '~~/shared/agendaItem'
import { filterAgendaItems } from '~/utils/agendaFilter'
import { useProjetosStore } from '~/stores/projetos'
const { list, loading, error, refresh, create, moveHorizon, complete, sessionNewTaskIds } = useTasks()
const { hasCheckedInToday: lifeCheckedInToday, ensureLoaded: ensureLifeLoaded } = useLifeTracker()
const { openEdit, openNew } = useTaskModal()
// Janela com chave PRÓPRIA. Antes `/trabalho` e `/agenda` compartilhavam o
// mesmo `useState` sem chave, então navegar semana numa mexia na outra.
const { view: agView, offset: agOffset, range: agRange } = useAgendaWindow('trabalho', 'week')
// Aqui a agenda mostra só o que é tarefa — esta tela é sobre execução de
// tarefa; metas e pagamentos aparecem em `/agenda`.
const agKinds = computed<AgendaItemKind[]>(() => ['task', 'followup'])
const { items: agItems } = useAgendaItems({ range: agRange, kinds: agKinds })
const agendaActions = useAgendaActions()
const { summary: payments, refresh: refreshPayments } = usePayments()
const { list: companiesList, refresh: refreshCompanies } = useCompanies()
const projetosStore = useProjetosStore()
const { user } = useCurrentUser()
const router = useRouter()
const toast = useToast()

// Sinaliza carregamento imediatamente para o indicador "Carregando…" aparecer
// já no primeiro frame (a página não fica mais branca/suspensa).
loading.value = true
// Dispara tudo em paralelo, sem bloquear a renderização da página.
onMounted(() => {
  ensureLifeLoaded()
  Promise.all([refresh(), refreshPayments(), refreshCompanies()]).catch(() => {})
})

// ── Column icons ──
const HORIZON_ICON: Record<HorizonUI, string> = {
  core7: 'calendar-clock',
  core30: 'flame',
  core60: 'zap',
  core90: 'target',
  hibernando: 'moon',
}

// ── Company filter ──
const tarefaCompanyFilter = ref<'all' | string>('all')
const tarefaCompanyOptions = computed(() => [
  { value: 'all', label: 'Todas as empresas' },
  ...companiesList.value
    .filter((c) => !c.archived)
    .map((c) => ({ value: c.id, label: c.name })),
])

const filteredTasks = computed(() => {
  if (tarefaCompanyFilter.value === 'all') return list.value
  return list.value.filter((t) => t.companyId === tarefaCompanyFilter.value)
})

// Ordenação ativa: por padrão data+hora com as recém-criadas no topo; com o
// botão de vencimento ligado, usa o ranking data+hora → data → A–Z.
const sortByDue = ref(false)

function compareTasks(a: Task, b: Task) {
  if (sortByDue.value) return compareByDue(a, b)
  const aNew = sessionNewTaskIds.value[a.id]
  const bNew = sessionNewTaskIds.value[b.id]
  if (aNew && !bNew) return -1
  if (bNew && !aNew) return 1
  return dateTimeKey(a).localeCompare(dateTimeKey(b))
}

const tasksByHorizon = computed<Record<HorizonUI, Task[]>>(() => {
  const by: Record<HorizonUI, Task[]> = {
    core7: [],
    core30: [],
    core60: [],
    core90: [],
    hibernando: [],
  }
  for (const t of filteredTasks.value) {
    // Concluídas ficam OCULTAS por padrão (filtro `showCompleted`); quando
    // exibidas, vão para o fim da coluna (ver sort abaixo).
    if (t.done && !showCompleted.value) continue
    const ui = horizonDbToUI[t.horizon] ?? 'core30'
    by[ui].push(t)
  }
  for (const arr of Object.values(by)) {
    arr.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return compareTasks(a, b)
    })
  }
  return by
})

// Filtro "mostrar concluídas" — desligado por padrão (não polui o board/lista).
const showCompleted = ref(false)

// Preferência local da ordenação por vencimento (mesmo padrão das demais).
const SORT_KEY = 'comando-trabalho-sort-due'
onMounted(() => {
  try {
    sortByDue.value = localStorage.getItem(SORT_KEY) === '1'
  } catch {
    // localStorage indisponível — segue com o default (desligado).
  }
})
watch(sortByDue, (v) => {
  try {
    localStorage.setItem(SORT_KEY, v ? '1' : '0')
  } catch {
    // ignora (localStorage cheio/bloqueado)
  }
})

// ── Lista (agrupada por horizonte) ──
const listGroups = computed(() =>
  HORIZONTES.map((h) => ({
    id: h.id,
    label: h.label,
    desc: h.desc,
    tasks: tasksByHorizon.value[h.id as HorizonUI] ?? [],
  })),
)
async function onToggleDone(task: Task) {
  try {
    await complete(task.id, !task.done)
  } catch (e) {
    console.error('complete failed', e)
  }
}

// ── Metrics (dados reais) ──
const HORIZON_BAR: Array<{ id: HorizonUI; label: string }> = [
  { id: 'core7', label: '7 dias' },
  { id: 'core30', label: '30 dias' },
  { id: 'core60', label: '60 dias' },
  { id: 'core90', label: '90 dias' },
  { id: 'hibernando', label: 'Hibernando' },
]

const resumo = computed(() => {
  const all = filteredTasks.value.filter((t) => !t.archived)
  const act = all.filter((t) => !t.done)
  const done = all.filter((t) => t.done)
  const ceo = act.filter((t) => t.type === 'ceo').length
  const delego = act.filter((t) => t.type === 'delegate').length
  const followup = act.filter((t) => t.followupActive).length
  const micro = act.filter((t) => t.isMicro).length
  const total = all.length
  const donePct = total ? Math.round((done.length / total) * 100) : 0
  const byHorizon = HORIZON_BAR.map((h) => ({
    ...h,
    n: act.filter((t) => (horizonDbToUI[t.horizon] ?? 'core30') === h.id).length,
  }))
  return { ativas: act.length, concluidas: done.length, ceo, delego, followup, micro, donePct, total, byHorizon }
})

// Status card: 3 headline buckets + density stripes
const statusBuckets = computed(() => {
  const m = Object.fromEntries(resumo.value.byHorizon.map((h) => [h.id, h.n]))
  return [
    { label: '7 dias', icon: 'calendar-clock', n: m.core7 ?? 0 },
    { label: 'Micro', icon: 'layers', n: resumo.value.micro },
    { label: 'Hibernando', icon: 'moon', n: m.hibernando ?? 0 },
  ]
})
const statusStripes = computed(() => {
  const counts = resumo.value.byHorizon.map((h) => h.n)
  const max = Math.max(...counts, 1)
  const out: number[] = []
  for (let i = 0; i < 16; i++) {
    const idx = Math.floor((i / 16) * counts.length)
    out.push((counts[idx] ?? 0) / max)
  }
  return out
})

// Completion card: per-horizonte active bars
const completionBars = computed(() => resumo.value.byHorizon.map((h) => h.n))

// Payments card
const paymentBars = computed(() => [
  (payments.value?.overdueTotalCents ?? 0) / 100,
  (payments.value?.pendingTotalCents ?? 0) / 100,
  (payments.value?.paidMonthTotalCents ?? 0) / 100,
])
const pendingTotalLabel = computed(() =>
  formatBRL(payments.value?.pendingTotalCents ?? 0),
)
const overdueCount = computed(() => payments.value?.overdueCount ?? 0)

// Load card: distribution curve across horizontes
const loadSeries = computed(() => [
  { points: resumo.value.byHorizon.map((h) => h.n), color: 'var(--micro-bar)', fill: true },
])

// ── Hero people (colaboradores reais) ──
const heroPeople = computed(() => {
  const names = new Set<string>()
  if (user.value?.name) names.add(user.value.name)
  for (const t of list.value) {
    if (t.delegatePersonName) names.add(t.delegatePersonName)
  }
  return [...names].slice(0, 8).map((name) => ({ name }))
})

// ── View tabs ──
// Layout views (Lista/Board/…) + views focadas por horizonte (30 dias, 7 dias,
// Micro, Backlog). As de horizonte mostram os cards do board filtrados.
type View =
  | 'board'
  | 'planilha'
  | 'calendario'
  | 'timeline'
  | 'h30'
  | 'h7'
  | 'hmicro'
  | 'hatrasados'
  | 'hbacklog'
const view = ref<View>('board')
const TABS: { value: View; label: string; icon: string }[] = [
  { value: 'planilha', label: 'Lista', icon: 'list' },
  { value: 'board', label: 'Board', icon: 'kanban' },
  { value: 'calendario', label: 'Calendário', icon: 'calendar' },
  { value: 'timeline', label: 'Timeline', icon: 'gantt-chart' },
  { value: 'h30', label: '30 dias', icon: 'calendar-days' },
  { value: 'h7', label: '7 dias', icon: 'calendar-clock' },
  { value: 'hmicro', label: 'Micro', icon: 'layers' },
  { value: 'hatrasados', label: 'Atrasados', icon: 'calendar-x' },
  { value: 'hbacklog', label: 'Backlog', icon: 'inbox' },
]

// Quais views o usuário escolheu exibir nas abas (preferência local, igual ao
// padrão do localStorage usado pela sidebar). Default: todas. (v2: novas views
// de horizonte → bump da chave para reaparecerem mesmo com pref antiga salva.)
const ALL_VIEWS = TABS.map((t) => t.value)
const VIEWS_KEY = 'comando-trabalho-views-v3'
const enabledViews = ref<View[]>([...ALL_VIEWS])
onMounted(() => {
  try {
    const raw = localStorage.getItem(VIEWS_KEY)
    if (raw) {
      const saved = (JSON.parse(raw) as string[]).filter((v): v is View =>
        ALL_VIEWS.includes(v as View),
      )
      if (saved.length) enabledViews.value = saved
    }
  } catch {
    // preferência corrompida/indisponível — segue com o default (todas).
  }
})
// Abas visíveis, sempre na ordem canônica de TABS.
const visibleTabs = computed(() => TABS.filter((t) => enabledViews.value.includes(t.value)))
watch(
  enabledViews,
  (v) => {
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(v))
    } catch {
      // ignora (localStorage cheio/bloqueado)
    }
    // Se a view ativa foi ocultada, cai na primeira visível.
    if (!v.includes(view.value) && v.length) view.value = v[0]!
  },
  { deep: true },
)

// ── Horizontes visíveis no board (colunas) ──
// Preferência local separada do seletor de layout: o usuário escolhe quais
// colunas/horizontes aparecem no board.
const ALL_HORIZONS = HORIZONTES.map((h) => h.id) as HorizonUI[]
const HORIZONS_KEY = 'comando-trabalho-horizons-v2'
const enabledHorizons = ref<HorizonUI[]>([...ALL_HORIZONS])
const horizonTabs = HORIZONTES.map((h) => ({
  value: h.id as HorizonUI,
  label: h.label,
  icon: HORIZON_ICON[h.id as HorizonUI],
}))
onMounted(() => {
  try {
    const raw = localStorage.getItem(HORIZONS_KEY)
    if (raw) {
      const saved = (JSON.parse(raw) as string[]).filter((h): h is HorizonUI =>
        ALL_HORIZONS.includes(h as HorizonUI),
      )
      if (saved.length) enabledHorizons.value = saved
    }
  } catch {
    // preferência corrompida/indisponível — segue com o default (todos).
  }
})
const visibleHorizontes = computed(() =>
  HORIZONTES.filter((h) => enabledHorizons.value.includes(h.id as HorizonUI)),
)

// Board agrupa as colunas em duas seções: FOCO (próximo) e BACKLOG (depois).
const boardSections = computed(() => {
  const groups = [
    { id: 'foco', label: 'Foco' },
    { id: 'backlog', label: 'Backlog' },
  ] as const
  return groups
    .map((g) => ({
      ...g,
      cols: visibleHorizontes.value.filter((h) => h.section === g.id),
    }))
    .filter((g) => g.cols.length > 0)
})
watch(
  enabledHorizons,
  (v) => {
    try {
      localStorage.setItem(HORIZONS_KEY, JSON.stringify(v))
    } catch {
      // ignora (localStorage cheio/bloqueado)
    }
  },
  { deep: true },
)

// ── Views focadas por horizonte (abas 30 dias / 7 dias / Micro / Backlog) ──
const HORIZON_VIEW_IDS = ['h30', 'h7', 'hmicro', 'hatrasados', 'hbacklog'] as const
const isHorizonView = computed(() =>
  (HORIZON_VIEW_IDS as readonly string[]).includes(view.value),
)

// Backlog é a seção 60 dias / 90 dias / Hibernando (sub-abas da view focada).
type BacklogSub = 'core60' | 'core90' | 'hibernando'
const backlogSub = ref<BacklogSub>('core60')
const backlogSubTabs: { value: BacklogSub; label: string }[] = [
  { value: 'core60', label: '60 dias' },
  { value: 'core90', label: '90 dias' },
  { value: 'hibernando', label: 'Hibernando' },
]

// Views "7 dias" e "30 dias" = tarefas ativas agendadas (ou com cobrança) dentro
// da janela de N dias, independente do horizonte (filtro por data, não por Core).
function tasksWithinDays(days: number): Task[] {
  const today = new Date()
  const start = today.toISOString().slice(0, 10)
  const end = new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10)
  return filteredTasks.value
    .filter((t) => {
      if (t.archived || t.done) return false
      const d = t.scheduledDate ?? (t.followupActive ? t.followupDate : null)
      return !!d && d >= start && d <= end
    })
    .sort(compareTasks)
}

// Atrasados: TODA tarefa ativa cuja data já passou — sem piso.
// Antes a janela era [hoje−7, ontem], então o que atrasou há mais de uma
// semana desaparecia da tela em silêncio. Regra de vencimento compartilhada
// com a agenda e com a lista (~/utils/overdue).
function overdueTasks(): Task[] {
  return filteredTasks.value
    .filter((t) => !t.archived && isOverdue(t))
    .sort(compareTasks)
}

// Horizonte-alvo da view focada atual (null para "7 dias"/"30 dias", que são por
// data, e para "Micro", que é por flag).
const focusHorizon = computed<HorizonUI | null>(() => {
  if (view.value === 'hbacklog') return backlogSub.value as HorizonUI
  return null
})

// Micros ativos (a coluna virou flag): ordena por concluído/data agendada.
const microTasks = computed<Task[]>(() =>
  filteredTasks.value
    .filter((t) => t.isMicro && !t.archived && !t.done)
    .sort(compareTasks),
)

const overdue = computed<Task[]>(() => overdueTasks())

const focusTasks = computed<Task[]>(() => {
  if (view.value === 'h7') return tasksWithinDays(7)
  if (view.value === 'h30') return tasksWithinDays(30)
  if (view.value === 'hmicro') return microTasks.value
  if (view.value === 'hatrasados') return overdue.value
  const h = focusHorizon.value
  return h ? tasksByHorizon.value[h] : []
})

const focusLabel = computed(() => {
  switch (view.value) {
    case 'h30':
      return 'Próximos 30 dias'
    case 'h7':
      return 'Próximos 7 dias'
    case 'hmicro':
      return 'Micro'
    case 'hatrasados':
      return 'Atrasados'
    case 'hbacklog':
      return backlogSubTabs.find((t) => t.value === backlogSub.value)?.label ?? 'Backlog'
    default:
      return ''
  }
})
const focusHint = computed(() => {
  switch (view.value) {
    case 'h30':
      return 'Agendadas para os próximos 30 dias'
    case 'h7':
      return 'Agendadas para os próximos 7 dias'
    case 'hmicro':
      return 'Até 30 min · batelada'
    case 'hatrasados':
      return 'Tudo que já venceu e continua aberto'
    case 'hbacklog':
      return HORIZONTES.find((h) => h.id === focusHorizon.value)?.desc ?? ''
    default:
      return ''
  }
})

// ── Metric card actions (botões dos cards do dashboard) ──
const tasksCardMenu: ContextMenuItem[] = [
  { key: 'board', label: 'Ver como board', icon: 'kanban' },
  { key: 'planilha', label: 'Ver como lista', icon: 'list' },
  { key: 'calendario', label: 'Ver calendário', icon: 'calendar' },
  { separator: true },
  { key: 'nova', label: 'Nova tarefa', icon: 'plus', shortcut: '⌘N' },
  { key: 'refresh', label: 'Atualizar dados', icon: 'refresh-cw' },
]
const paymentsCardMenu: ContextMenuItem[] = [
  { key: 'pagamentos', label: 'Abrir pagamentos', icon: 'dollar-sign' },
  { key: 'refresh', label: 'Atualizar dados', icon: 'refresh-cw' },
]

async function refreshAll() {
  await Promise.all([refresh(), refreshPayments(), refreshCompanies()]).catch(() => {})
  toast.show('Dados atualizados.')
}

async function onCardMenu(key: string) {
  switch (key) {
    case 'board':
    case 'planilha':
    case 'calendario':
      view.value = key
      break
    case 'nova':
      openNew()
      break
    case 'pagamentos':
      await router.push('/pagamentos')
      break
    case 'refresh':
      await refreshAll()
      break
  }
}

// ── Board / agenda actions ──
async function onDrop(taskId: string, toHorizonUi: HorizonUI) {
  try {
    await moveHorizon(taskId, toHorizonUi)
  } catch (e) {
    console.error('moveHorizon failed', e)
  }
}
async function onInbox(title: string, isMicro = false) {
  // Micro entra no foco imediato (7 dias) com a flag; senão, 30 dias.
  await create({ title, type: 'ceo', horizon: isMicro ? 'core7' : 'core30', isMicro })
}
function onOpenTask(task: Task) {
  openEdit(task)
}
// O "+" de uma coluna do board já cria a tarefa no horizonte daquela coluna
// (antes o argumento era ignorado e toda tarefa nova caía no default 30 dias).
function onAddTo(horizonUi: string) {
  openNew({ horizon: horizonUIToDb[horizonUi as HorizonUI] ?? 'core30' })
}
// O "+" das views focadas (7 dias / 30 dias / Micro / Backlog) cria já no
// horizonte/flag da view atual.
function onFocusAdd() {
  if (view.value === 'h7') openNew({ horizon: 'core7' })
  else if (view.value === 'h30') openNew({ horizon: 'core30' })
  else if (view.value === 'hmicro') openNew({ horizon: 'core7', isMicro: true })
  else if (view.value === 'hatrasados') openNew({ horizon: 'core7' })
  else if (view.value === 'hbacklog') openNew({ horizon: horizonUIToDb[backlogSub.value] })
  else openNew()
}

// Calendário e Timeline lembram, cada um, a granularidade (dia/semana/mês) que o
// usuário escolheu por último (o Calendário agora tem zoom de período próprio).
const agGranularity = ref<TimelineView>('week')
const calGranularity = ref<TimelineView>('week')
watch(
  view,
  (v) => {
    if (v === 'calendario') agView.value = calGranularity.value
    else if (v === 'timeline') agView.value = agGranularity.value
  },
  { immediate: true },
)
watch(agView, (v) => {
  if (view.value === 'timeline') agGranularity.value = v
  else if (view.value === 'calendario') calGranularity.value = v
})

const granularityTabs = [
  { value: 'day' as const, label: 'Dia' },
  { value: 'week' as const, label: 'Semana' },
  { value: 'month' as const, label: 'Mês' },
]

// Itens da agenda respeitando o filtro de empresa da página. Passa a usar o
// MESMO pipeline de `/agenda` (~/utils/agendaFilter) — antes esta tela filtrava
// só por empresa direta, sem o vínculo indireto via projeto, e os mesmos dados
// apareciam diferentes nas duas telas.
const companyProjectIds = computed(() => {
  if (tarefaCompanyFilter.value === 'all') return null
  return new Set(
    projetosStore.list
      .filter((p) => p.company_id === tarefaCompanyFilter.value)
      .map((p) => p.id),
  )
})

const agFilteredEvents = computed(() =>
  filterAgendaItems(agItems.value, {
    company: tarefaCompanyFilter.value,
    companyProjectIds: companyProjectIds.value,
    showDone: showCompleted.value,
  }),
)

function agPrev() { agOffset.value-- }
function agToday() { agOffset.value = 0 }
function agNext() { agOffset.value++ }

const mkDM = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
const monthYearLabel = computed(() => {
  const s = agRange.value.start
  return `${MESES[s.getMonth()]} ${s.getFullYear()}`
})
const windowLabel = computed(() => {
  const s = agRange.value.start
  const e = agRange.value.end
  return agRange.value.days === 1 ? mkDM(s) : `${mkDM(s)} – ${mkDM(e)}`
})
</script>

<template>
  <div class="trabalho-page">
    <PageHero
      title="Relatório de tarefas"
      description="Acompanhe suas tarefas, monitore o progresso e mantenha o status sob controle. Organize seu fluxo e transforme a forma como você entrega resultados."
      :people="heroPeople"
    />

    <VidaDailyCheckinCard v-if="!lifeCheckedInToday" />

    <!-- ── Métricas ── -->
    <section class="metrics" aria-label="Métricas">
      <MetricCard
        title="Status das tarefas"
        icon="square-check-big"
        :menu="tasksCardMenu"
        @edit="openNew"
        @expand="view = 'board'"
        @menu-select="onCardMenu"
      >
        <div class="status-row">
          <div v-for="b in statusBuckets" :key="b.label" class="status-stat">
            <div class="ss-num">{{ b.n }}</div>
            <div class="ss-lab">
              {{ b.label }}
              <BaseIcon :name="b.icon" :size="12" />
            </div>
          </div>
        </div>
        <ActivityBar :values="statusStripes" :height="68" />
        <div class="mc-axis">
          <span>agora</span>
          <span>depois</span>
        </div>
      </MetricCard>

      <MetricCard
        title="Conclusão"
        icon="circle-check-big"
        :menu="tasksCardMenu"
        @edit="openNew"
        @expand="view = 'planilha'"
        @menu-select="onCardMenu"
      >
        <div class="big-num">
          {{ resumo.donePct }}<span class="bn-unit">%</span>
        </div>
        <div class="mc-caption">{{ resumo.concluidas }} de {{ resumo.total }} concluídas</div>
        <div class="mc-chart-sm">
          <SparkBars :values="completionBars" accent="var(--success)" :height="44" />
        </div>
      </MetricCard>

      <MetricCard
        title="Pagamentos"
        icon="dollar-sign"
        to="/pagamentos"
        :menu="paymentsCardMenu"
        @edit="$router.push('/pagamentos')"
        @menu-select="onCardMenu"
      >
        <div class="big-num money">{{ pendingTotalLabel }}</div>
        <MetricDelta
          v-if="overdueCount > 0"
          :value="-overdueCount"
          period="atrasados"
          good-when="up"
        />
        <div v-else class="mc-caption">Em dia</div>
        <div class="mc-chart-sm">
          <SparkBars
            :values="paymentBars"
            :highlight="[0]"
            accent="var(--danger)"
            color="var(--border-strong)"
            :height="44"
          />
        </div>
      </MetricCard>

      <MetricCard
        class="metric-wide"
        title="Carga por horizonte"
        icon="bar-chart-3"
        subtitle="(tarefas ativas)"
        :menu="tasksCardMenu"
        @edit="openNew"
        @expand="view = 'board'"
        @menu-select="onCardMenu"
      >
        <div class="load-head">
          <div class="big-num">{{ resumo.ativas }}</div>
          <div class="mc-caption">{{ resumo.ceo }} CEO · {{ resumo.delego }} delegadas</div>
        </div>
        <div class="mc-chart-lg">
          <SparkLine :series="loadSeries" :height="96" />
        </div>
        <div class="mc-axis">
          <span>7 dias</span>
          <span>Hibernando</span>
        </div>
      </MetricCard>
    </section>

    <!-- ── View switcher ── -->
    <div class="view-bar">
      <ViewTabs v-model="view" :tabs="visibleTabs" aria-label="Visualização" />
      <div class="view-tools">
        <TarefasViewVisibilityMenu
          v-model="enabledViews"
          :tabs="TABS"
          aria-label="Escolher visualizações"
        />
        <TarefasViewVisibilityMenu
          v-if="view === 'board'"
          v-model="enabledHorizons"
          :tabs="horizonTabs"
          label="Horizontes"
          aria-label="Escolher horizontes do board"
        />
        <button
          v-if="!['calendario', 'timeline'].includes(view)"
          type="button"
          class="done-filter"
          :class="{ on: sortByDue }"
          :aria-pressed="sortByDue"
          :title="
            sortByDue
              ? 'Ordenação padrão'
              : 'Ordenar por vencimento (data + hora → data → A–Z)'
          "
          @click="sortByDue = !sortByDue"
        >
          <BaseIcon :name="sortByDue ? 'arrow-down-narrow-wide' : 'arrow-up-down'" :size="15" />
          Vencimento
        </button>
        <button
          v-if="['board', 'planilha', 'hbacklog'].includes(view)"
          type="button"
          class="done-filter"
          :class="{ on: showCompleted }"
          :aria-pressed="showCompleted"
          :title="showCompleted ? 'Ocultar concluídas' : 'Mostrar concluídas'"
          @click="showCompleted = !showCompleted"
        >
          <BaseIcon :name="showCompleted ? 'eye' : 'eye-off'" :size="15" />
          Concluídas
        </button>
        <label class="filter-control">
          <BaseIcon name="filter" :size="15" />
          <select v-model="tarefaCompanyFilter" aria-label="Filtrar por empresa">
            <option v-for="o in tarefaCompanyOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="error" class="state error">{{ error }}</div>
    <div v-else-if="loading && list.length === 0" class="state">Carregando…</div>

    <!-- ── Board (Kanban) ── -->
    <div v-if="view === 'board'" class="board-wrap">
      <div class="board-quick">
        <TarefasInboxQuick @submit="onInbox" />
      </div>
      <div class="board-scroll">
        <div class="board-track">
          <section
            v-for="sec in boardSections"
            :key="sec.id"
            class="board-section"
            :class="`board-section--${sec.id}`"
          >
            <h3 class="board-section-label">{{ sec.label }}</h3>
            <div class="board-section-cols">
              <BoardColumn
                v-for="h in sec.cols"
                :key="h.id"
                :horizonte="h"
                :icon="HORIZON_ICON[h.id]"
                :tasks="tasksByHorizon[h.id]"
                @drop-task="(id) => onDrop(id, h.id)"
                @open-task="onOpenTask"
                @add="onAddTo"
              />
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- ── Lista (tabela agrupada por horizonte) ── -->
    <div v-if="view === 'planilha'" class="list-wrap">
      <TarefasInboxQuick @submit="onInbox" />
      <TarefasListView
        :groups="listGroups"
        @open-task="onOpenTask"
        @toggle-done="onToggleDone"
        @add="onAddTo"
        @move="(id, h) => onDrop(id, h as HorizonUI)"
      />
    </div>

    <!-- ── Calendário ── -->
    <div v-if="view === 'calendario'" class="agenda-view">
      <div class="agenda-toolbar">
        <div class="at-left">
          <span class="at-month">{{ monthYearLabel }}</span>
          <button type="button" class="at-today" :disabled="agOffset === 0" @click="agToday">
            Hoje
          </button>
          <div class="at-nav">
            <button type="button" class="at-btn" aria-label="Anterior" @click="agPrev">
              <BaseIcon name="chevron-left" :size="17" />
            </button>
            <span class="at-range">{{ windowLabel }}</span>
            <button type="button" class="at-btn" aria-label="Próximo" @click="agNext">
              <BaseIcon name="chevron-right" :size="17" />
            </button>
          </div>
        </div>
      </div>
      <AgendaCalendar
        :range="agRange"
        :items="agFilteredEvents"
        @open="agendaActions.open"
        @move="agendaActions.move"
      />
    </div>

    <!-- ── Timeline ── -->
    <div v-if="view === 'timeline'" class="agenda-view">
      <div class="agenda-toolbar">
        <div class="at-left">
          <span class="at-month">{{ monthYearLabel }}</span>
          <button type="button" class="at-today" :disabled="agOffset === 0" @click="agToday">
            Hoje
          </button>
          <div class="at-nav">
            <button type="button" class="at-btn" aria-label="Anterior" @click="agPrev">
              <BaseIcon name="chevron-left" :size="17" />
            </button>
            <span class="at-range">{{ windowLabel }}</span>
            <button type="button" class="at-btn" aria-label="Próximo" @click="agNext">
              <BaseIcon name="chevron-right" :size="17" />
            </button>
          </div>
        </div>
        <ViewTabs v-model="agView" :tabs="granularityTabs" aria-label="Granularidade" />
      </div>
      <AgendaTimeline
        :range="agRange"
        :items="agFilteredEvents"
        :view="agView"
        @open="agendaActions.open"
        @toggle-done="agendaActions.toggleDone"
      />
    </div>

    <!-- ── Views focadas por horizonte (30 dias / 7 dias / Micro / Backlog) ── -->
    <div v-if="isHorizonView" class="focus-view">
      <div v-if="view === 'hbacklog'" class="focus-subtabs">
        <ViewTabs v-model="backlogSub" :tabs="backlogSubTabs" aria-label="Subdivisão do backlog" />
      </div>
      <div class="focus-head">
        <div class="focus-head-text">
          <h3 class="focus-title">{{ focusLabel }}</h3>
          <span v-if="focusHint" class="focus-hint">{{ focusHint }}</span>
        </div>
        <span class="focus-count">{{ focusTasks.length }}</span>
        <button type="button" class="focus-add" @click="onFocusAdd">
          <BaseIcon name="plus" :size="15" />
          Nova tarefa
        </button>
      </div>
      <div v-if="focusTasks.length" class="focus-grid">
        <BoardCard
          v-for="t in focusTasks"
          :key="t.id"
          :task="t"
          @open="onOpenTask"
        />
      </div>
      <div v-else class="focus-empty">Nenhuma tarefa aqui.</div>
    </div>
  </div>
</template>

<style scoped>
.trabalho-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 24px 26px 60px;
  max-width: 1480px;
  margin: 0 auto;
}

/* ── Metrics ── */
.metrics {
  display: grid;
  grid-template-columns: 1.1fr 0.85fr 0.85fr 1.4fr;
  gap: 14px;
}
.metric-wide {
  min-width: 0;
}
.status-row {
  display: flex;
  gap: 18px;
}
.status-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ss-num {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
}
.ss-lab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
}
.ss-lab :deep(svg) {
  color: var(--text-4);
}
.big-num {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
}
.big-num.money {
  font-size: 22px;
}
.bn-unit {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-3);
  margin-left: 1px;
}
.mc-caption {
  font-size: 13px;
  color: var(--text-3);
}
.mc-chart-sm {
  margin-top: auto;
}
.mc-chart-lg {
  flex: 1;
  min-height: 80px;
}
.mc-axis {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
.load-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

/* ── View bar ── */
.view-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.view-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
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
}
.filter-control:hover {
  border-color: var(--border-strong);
}
.done-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-3);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-spring),
              border-color var(--dur-fast) var(--ease-spring),
              color var(--dur-fast) var(--ease-spring);
}
.done-filter:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.done-filter.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
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

.state {
  padding: 16px;
  font-size: 13px;
  color: var(--text-3);
}
.state.error {
  color: var(--danger);
}

/* ── Board ── */
.board-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.board-quick {
  max-width: 520px;
}
/* O SCROLLER: board é um scroller 2D próprio (estilo Trello). Rola na horizontal
   E na vertical DENTRO de si — o scroll-X fica confinado ao board (a página nunca
   rola lateralmente) e os cabeçalhos das colunas (.bcol-head, sticky) ficam fixos
   no topo ao rolar verticalmente, enquanto a página continua rolando o dashboard
   acima. A altura é limitada à viewport para gerar o scroll interno; o desconto
   (~120px) cobre topbar + margens do painel (aproximado). */
.board-scroll {
  width: 100%;
  max-height: calc(100dvh - 120px);
  overflow: auto;
  /* Não encadeia o scroll de volta para a página ao chegar no fim do board. */
  overscroll-behavior: contain;
  scroll-snap-type: x proximity;
}
/* A TRILHA: layout flex das seções. Cresce até a altura TOTAL do conteúdo (sem
   teto de altura), então cada seção/coluna contém todos os seus cards e o
   .board-scroll é quem rola para revelá-los. stretch deixa as seções com a mesma
   altura. width: max-content para transbordar na horizontal e gerar o scroll-x. */
.board-track {
  display: flex;
  align-items: stretch;
  gap: 28px;
  width: max-content;
  min-width: 100%;
  padding-bottom: 12px;
}

/* Cabeçalho da coluna fixo no topo do board (7 dias / 30 dias / …): como o
   board é o próprio scroller, o sticky gruda no topo ao rolar verticalmente e
   acompanha as colunas ao rolar horizontalmente. */
.board-scroll :deep(.bcol-head) {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--panel);
  margin: 0 -4px;
  padding: 8px 8px 10px;
  border-radius: var(--radius-md);
  box-shadow: 0 6px 10px -10px rgba(0, 0, 0, 0.25);
}
/* BACKLOG tem fundo acinzentado — o header fixo acompanha para não “vazar”. */
.board-section--backlog :deep(.bcol-head) {
  background: var(--surface-alt);
}
/* Cada seção (FOCO / BACKLOG) é um retângulo com borda preta e rótulo no topo,
   deixando a divisão entre as duas explícita. */
.board-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 0 0 auto;
  scroll-snap-align: start;
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
}
/* BACKLOG: além da borda pontilhada (comum a todas), ganha fundo acinzentado. */
.board-section--backlog {
  background: var(--surface-alt);
}
.board-section-label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
  padding: 0 4px;
}
/* FOCO em destaque ("bold"): rótulo mais forte e com um marcador. */
.board-section--foco .board-section-label {
  font-weight: 800;
  color: var(--text);
}
.board-section--foco .board-section-label::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--core7-bar);
  margin-right: 8px;
  vertical-align: middle;
}
.board-section-cols {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  gap: 18px;
}

/* ── List / Planilha ── */
.list-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 920px;
}

/* ── Calendar ── */
/* ── Agenda views (calendário / timeline) ── */
.agenda-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.agenda-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.at-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.at-month {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  text-transform: capitalize;
}
.at-today {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.at-today:hover:not(:disabled) {
  background: var(--surface-hover);
}
.at-today:disabled {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
  cursor: default;
}
.at-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.at-btn {
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
.at-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.at-range {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  min-width: 92px;
  text-align: center;
}

/* ── Views focadas por horizonte ── */
.focus-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.focus-subtabs {
  display: flex;
}
.focus-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.focus-head-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.focus-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text);
}
.focus-hint {
  font-size: 13px;
  color: var(--text-3);
}
.focus-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.focus-add {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.focus-add:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
}
.focus-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.focus-empty {
  padding: 28px;
  text-align: center;
  font-size: 13px;
  color: var(--text-4);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
}

/* ── Responsive ── */
@media (max-width: 1200px) {
  .metrics {
    grid-template-columns: 1fr 1fr;
  }
  .metric-wide {
    grid-column: span 2;
  }
}
@media (max-width: 720px) {
  .trabalho-page {
    padding: 18px 16px 80px;
    gap: 18px;
  }
  .metrics {
    grid-template-columns: 1fr;
  }
  .metric-wide {
    grid-column: span 1;
  }
  /* Barra de visualização empilha: abas (roláveis) em cima, ferramentas embaixo. */
  .view-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .view-tools {
    flex-wrap: wrap;
  }
  /* Os menus (Visualizações/Horizontes) ficam lado a lado em largura natural; o
     filtro de empresa quebra para a própria linha cheia (não corta mais o texto). */
  .filter-control {
    flex: 1 0 100%;
  }
  .filter-control select {
    flex: 1;
  }
  .focus-grid {
    grid-template-columns: 1fr;
  }
}
</style>

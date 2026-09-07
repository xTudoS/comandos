<script setup lang="ts">
import { useMetasStore } from '~/stores/metas'
import { useProjetosStore } from '~/stores/projetos'
import { useNotesStore } from '~/stores/notes'
import { isOverdue } from '~/utils/overdue'

// Contadores da sidebar — derivados das MESMAS fontes que as páginas mutam
// (composables/stores com estado compartilhado), em vez de useFetch próprios.
// Assim, criar/editar/concluir/arquivar em qualquer tela atualiza os badges
// na hora, sem precisar recarregar a página (F5).
const tasks = useTasks()
const payments = usePayments()
const metasStore = useMetasStore()
const projetosStore = useProjetosStore()
const notesStore = useNotesStore()
const bookingReqs = useBookingRequests()
const offline = useOfflineSync()

// Ao montar o shell (logado), baixa TODOS os recursos para uso offline em
// paralelo — popula o estado compartilhado das telas (navegação instantânea) e
// aquece o cache do service worker. Não bloqueia a renderização.
//
// Em seguida, mantém os dados frescos automaticamente (sem F5):
//  - tempo real (Fase 2): WebSocket no worker comando-sync invalida na hora;
//  - auto-refresh (Fase 1): revalida ao focar a aba e em polling — mantido como
//    rede de segurança (cobre mudanças que não passam por um cliente conectado
//    e os ambientes onde o tempo real não está configurado).
const autoRefresh = useAutoRefresh()
const realtime = useRealtimeSync()
// Enquanto o WebSocket está conectado, o tempo real substitui o polling de 25s:
// pausa o poll periódico (o refetch ao focar continua) e o religa se o socket cai.
watch(realtime.connected, (isConnected) => autoRefresh.setPaused(isConnected))
onMounted(() => {
  offline.warm()
  autoRefresh.start()
  realtime.start()
  bookingReqs.refreshPendingCount()
})
onUnmounted(() => {
  autoRefresh.stop()
  realtime.stop()
})

const ativasCount = computed(
  () => tasks.list.value.filter((t) => !t.done && !t.archived).length,
)
const agendaCount = computed(
  () =>
    tasks.list.value.filter(
      (t) =>
        !t.done &&
        !t.archived &&
        ((t.followupActive && !!t.followupDate) || !!t.scheduledDate),
    ).length,
)
// Atrasadas viram `alert` (badge vermelho) no item Agenda, no mesmo padrão que
// Pagamentos já usava. Antes a Agenda só mostrava `count` — o total de tarefas
// com data —, então nada no menu distinguia "tem coisa marcada" de "tem coisa
// vencida". Regra de vencimento compartilhada em ~/utils/overdue.
const agendaOverdueCount = computed(
  () => tasks.list.value.filter((t) => !t.archived && isOverdue(t)).length,
)
const metasAtivasCount = computed(
  () => metasStore.ativas.filter((m) => metasStore.statusMeta(m) !== 'concluida').length,
)
const projetosCount = computed(() => projetosStore.ativos.length)
const notasCount = computed(() => notesStore.ativas.length)
const pagPendingCount = computed(() => payments.summary.value?.pendingCount ?? 0)
const pagOverdueCount = computed(() => payments.summary.value?.overdueCount ?? 0)

type NavItem = {
  view: string
  label: string
  icon: string
  count?: number
  alert?: number
  /** Destino explícito. Sem isso o link é `/${view}` (o caso das views fixas). */
  to?: string
  /** Id do quadro — marca o item como alvo de drop de card (ver useBoardDropTargets). */
  boardId?: string
}
type NavGroup = { label: string; items: NavItem[] }

// Itens de cada grupo ficam em ordem alfabética (localeCompare pt) — assim novos
// itens entram no lugar certo sem reordenação manual. A ordem dos grupos em si é
// temática (Principal → Gestão → Conhecimento), não alfabética.
const groups = computed<NavGroup[]>(() =>
  [
    {
      label: 'Principal',
      items: [
        {
          view: 'agenda',
          label: 'Agenda',
          icon: 'calendar',
          // Havendo atraso, o alerta substitui a contagem — dois números
          // colados no mesmo item competiriam entre si.
          count: agendaOverdueCount.value > 0 ? undefined : agendaCount.value,
          alert: agendaOverdueCount.value > 0 ? agendaOverdueCount.value : undefined,
        },
        { view: 'trabalho', label: 'Trabalho', icon: 'square-check-big', count: ativasCount.value },
        {
          view: 'agendamentos',
          label: 'Agendamentos',
          icon: 'calendar-clock',
          count: bookingReqs.pendingCount.value || undefined,
        },
        { view: 'comando', label: 'Comando', icon: 'sparkles' },
        { view: 'vida', label: 'Vida', icon: 'heart-pulse' },
      ],
    },
    {
      label: 'Gestão',
      items: [
        { view: 'empresas', label: 'Empresas', icon: 'building-2' },
        { view: 'metas', label: 'Metas', icon: 'target', count: metasAtivasCount.value },
        {
          view: 'pagamentos',
          label: 'Pagamentos',
          icon: 'dollar-sign',
          count: pagOverdueCount.value > 0 ? undefined : pagPendingCount.value,
          alert: pagOverdueCount.value > 0 ? pagOverdueCount.value : undefined,
        },
        { view: 'projetos', label: 'Projetos', icon: 'folder', count: projetosCount.value },
      ],
    },
    {
      label: 'Conhecimento',
      items: [
        { view: 'arquivo', label: 'Arquivo', icon: 'archive' },
        { view: 'notas', label: 'Notas', icon: 'file-text', count: notasCount.value },
      ],
    },
  ].map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => a.label.localeCompare(b.label, 'pt')),
  })),
)

// Quadros customizados: grupo próprio, fora do `groups` acima porque a ordem
// aqui é a que o usuário definiu (boards.position), não alfabética.
const { active: activeBoards, refresh: refreshBoards } = useBoards()
onMounted(() => {
  refreshBoards().catch(() => {})
})

const quadrosGroup = computed<NavGroup>(() => ({
  label: 'Quadros',
  items: [
    ...activeBoards.value.map((b) => ({
      view: `quadros/${b.id}`,
      to: `/quadros/${b.id}`,
      boardId: b.id,
      label: b.name,
      icon: b.icon,
      count: b.cardCount || undefined,
    })),
    { view: 'quadros', to: '/quadros', label: 'Todos os quadros', icon: 'plus' },
  ],
}))

const allGroups = computed<NavGroup[]>(() => [...groups.value, quadrosGroup.value])

// Os itens de quadro da sidebar aceitam cards arrastados do board de /trabalho.
const navEl = ref<HTMLElement>()
const boardIdList = computed(() => activeBoards.value.map((b) => b.id))
const { show: dropToast } = useToast()
const nuxtApp = useNuxtApp()

useBoardDropTargets(navEl, boardIdList, (boardId, taskId) => {
  const board = activeBoards.value.find((b) => b.id === boardId)
  // O callback vem de um evento de DOM, fora do setup: sem runWithContext o
  // `useState` de dentro do useBoard não acha a instância do Nuxt.
  void nuxtApp
    .runWithContext(() => useBoard(boardId).addExistingTask(taskId))
    .then(() => {
      dropToast(
        board?.memberCount
          ? `Adicionada a ${board.name} — os membros passam a enxergar esta tarefa.`
          : `Adicionada a ${board?.name ?? 'quadro'}.`,
        board?.memberCount ? 3600 : 1800,
      )
      void refreshBoards()
    })
    .catch(() => dropToast('Não foi possível adicionar ao quadro.'))
})

const footerLinks = [
  { to: '/settings', label: 'Configurações', icon: 'settings' },
  { to: '/settings/people', label: 'Pessoas', icon: 'users' },
]

const mobileTabs = computed(() =>
  [
    { view: 'agenda', label: 'Agenda', icon: 'calendar' },
    { view: 'metas', label: 'Metas', icon: 'target' },
    { view: 'projetos', label: 'Projetos', icon: 'folder' },
    { view: 'trabalho', label: 'Trabalho', icon: 'square-check-big' },
    { view: 'vida', label: 'Vida', icon: 'heart-pulse' },
  ].sort((a, b) => a.label.localeCompare(b.label, 'pt')),
)

const route = useRoute()
// Os quadros têm um item por id na sidebar, então o "view" ativo precisa do
// segundo segmento (`quadros/<id>`); as demais views são só o primeiro.
const current = computed(() => {
  const [, first, second] = route.path.split('/')
  if (first === 'quadros' && second) return `quadros/${second}`
  return first || 'trabalho'
})

const { user, refresh: refreshUser } = useCurrentUser()
onMounted(() => {
  if (!user.value) refreshUser()
})

// ── Collapsible section groups ──
const collapsed = ref<Set<string>>(new Set())
function toggleGroup(label: string) {
  const next = new Set(collapsed.value)
  if (next.has(label)) next.delete(label)
  else next.add(label)
  collapsed.value = next
}

// ── Sidebar rail collapse ──
const railCollapsed = ref(false)
onMounted(() => {
  railCollapsed.value = localStorage.getItem('comando-sidebar-collapsed') === '1'
})
function toggleRail() {
  railCollapsed.value = !railCollapsed.value
  localStorage.setItem('comando-sidebar-collapsed', railCollapsed.value ? '1' : '0')
}

const { openNew } = useTaskModal()
function onNovaTarefa() {
  openNew()
}

const userInitial = computed(() => (user.value?.name || 'C').charAt(0))

// ── Menu "Mais" (mobile) ──
// No mobile a sidebar some; este sheet dá acesso a toda a navegação secundária
// (Empresas, Pagamentos, Arquivo), Configurações, Pessoas, conta e logout.
const { logout } = useAuth()
const moreOpen = ref(false)
const { panelOpen: syncPanelOpen, count: syncCount } = useSyncStatus()
function closeMore() {
  moreOpen.value = false
}
function openSync() {
  moreOpen.value = false
  syncPanelOpen.value = true
}
async function onLogout() {
  moreOpen.value = false
  closeAccountMenu()
  await logout()
}

// ── Menu de conta (desktop) ──
// O chip da conta vira gatilho de um menu (Configurações / Pessoas / Sair) — no
// desktop não havia como sair. O menu é teleportado pro body porque a .sidebar
// tem overflow-x:hidden e cortaria um popover interno; posiciona por
// getBoundingClientRect (cobre o rail recolhido, scroll e resize).
const accountMenuOpen = ref(false)
const accountTrigger = ref<HTMLElement | null>(null)
const accountMenuStyle = ref<{ left: string; bottom: string; minWidth: string }>({
  left: '0px',
  bottom: '0px',
  minWidth: '200px',
})

function positionAccountMenu() {
  const el = accountTrigger.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const minWidth = Math.max(200, r.width)
  accountMenuStyle.value = {
    left: `${Math.min(r.left, window.innerWidth - minWidth - 8)}px`,
    bottom: `${window.innerHeight - r.top + 6}px`,
    minWidth: `${minWidth}px`,
  }
}

function onAccountDocClick(e: MouseEvent) {
  const t = e.target as Node | null
  if (accountTrigger.value?.contains(t)) return
  if ((t as HTMLElement | null)?.closest?.('.account-menu')) return
  closeAccountMenu()
}
function onAccountKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAccountMenu()
}
async function toggleAccountMenu() {
  if (accountMenuOpen.value) {
    closeAccountMenu()
    return
  }
  accountMenuOpen.value = true
  await nextTick()
  positionAccountMenu()
  document.addEventListener('click', onAccountDocClick, true)
  document.addEventListener('keydown', onAccountKey)
  window.addEventListener('resize', positionAccountMenu)
}
function closeAccountMenu() {
  if (!accountMenuOpen.value) return
  accountMenuOpen.value = false
  document.removeEventListener('click', onAccountDocClick, true)
  document.removeEventListener('keydown', onAccountKey)
  window.removeEventListener('resize', positionAccountMenu)
}
onUnmounted(closeAccountMenu)
</script>

<template>
  <div class="app" :class="{ 'rail-collapsed': railCollapsed }">
    <!-- ── Sidebar (desktop) ── -->
    <aside class="sidebar">
      <div class="brand-row">
        <NuxtLink to="/trabalho" class="brand" aria-label="Ir para Trabalho">
          <img
            src="/logo-comando.svg"
            alt="Comando"
            class="brand-logo"
            width="120"
            height="35"
          >
          <span class="brand-mark">C</span>
        </NuxtLink>
        <button
          type="button"
          class="rail-toggle"
          :aria-label="railCollapsed ? 'Expandir menu' : 'Recolher menu'"
          :title="railCollapsed ? 'Expandir' : 'Recolher'"
          @click="toggleRail"
        >
          <BaseIcon :name="railCollapsed ? 'chevrons-right' : 'chevrons-left'" :size="16" />
        </button>
      </div>

      <nav ref="navEl" class="nav">
        <div v-for="g in allGroups" :key="g.label" class="nav-group">
          <button
            type="button"
            class="nav-group-label"
            :aria-expanded="!collapsed.has(g.label)"
            @click="toggleGroup(g.label)"
          >
            <span>{{ g.label }}</span>
            <BaseIcon
              name="chevron-down"
              :size="13"
              class="group-chevron"
              :class="{ rotated: collapsed.has(g.label) }"
            />
          </button>
          <div v-show="!collapsed.has(g.label)" class="nav-group-items">
            <NuxtLink
              v-for="it in g.items"
              :key="it.view"
              :to="it.to ?? `/${it.view}`"
              class="nav-item"
              :class="{ active: current === it.view }"
              :title="it.label"
              :data-board-id="it.boardId"
            >
              <BaseIcon :name="it.icon" :size="18" class="nav-icon" />
              <span class="nav-label">{{ it.label }}</span>
              <span v-if="it.alert" class="nav-alert">{{ it.alert }}</span>
              <span v-else-if="it.count" class="nav-count">{{ it.count }}</span>
            </NuxtLink>
          </div>
        </div>
      </nav>

      <div class="sidebar-foot">
        <NuxtLink
          v-for="f in footerLinks"
          :key="f.to"
          :to="f.to"
          class="foot-link"
          :title="f.label"
        >
          <BaseIcon :name="f.icon" :size="17" class="foot-icon" />
          <span class="foot-label">{{ f.label }}</span>
        </NuxtLink>
        <button type="button" class="foot-link" title="Sincronização" @click="syncPanelOpen = true">
          <BaseIcon name="refresh-cw" :size="17" class="foot-icon" />
          <span class="foot-label">Sincronização</span>
          <span v-if="syncCount" class="nav-count">{{ syncCount }}</span>
        </button>

        <button
          ref="accountTrigger"
          type="button"
          class="user-chip"
          :class="{ 'is-open': accountMenuOpen }"
          :aria-expanded="accountMenuOpen"
          aria-haspopup="menu"
          title="Conta"
          @click="toggleAccountMenu"
        >
          <span class="user-avatar">{{ userInitial }}</span>
          <span class="user-meta">
            <span class="user-name">{{ user?.name || 'Comando' }}</span>
            <span class="user-mail">{{ user?.email || '' }}</span>
          </span>
          <BaseIcon name="chevrons-up-down" :size="15" class="user-cog" />
        </button>
      </div>
    </aside>

    <!-- ── Menu de conta (desktop) — teleportado pra escapar do overflow da sidebar ── -->
    <Teleport to="body">
      <div
        v-if="accountMenuOpen"
        class="account-menu"
        role="menu"
        :style="accountMenuStyle"
      >
        <NuxtLink to="/settings" class="account-item" role="menuitem" @click="closeAccountMenu">
          <BaseIcon name="settings" :size="16" class="account-ico" />
          <span>Configurações</span>
        </NuxtLink>
        <NuxtLink to="/settings/people" class="account-item" role="menuitem" @click="closeAccountMenu">
          <BaseIcon name="users" :size="16" class="account-ico" />
          <span>Pessoas</span>
        </NuxtLink>
        <div class="account-sep" role="separator" />
        <button type="button" class="account-item danger" role="menuitem" @click="onLogout">
          <BaseIcon name="log-out" :size="16" class="account-ico" />
          <span>Sair</span>
        </button>
      </div>
    </Teleport>

    <!-- ── Floating panel ── -->
    <div class="panel">
      <Topbar @nova-tarefa="onNovaTarefa" />
      <AuthDeviceApprovalBanner />
      <main class="main">
        <div class="view-wrap">
          <slot />
        </div>
      </main>
    </div>

    <!-- ── Mobile bottom tabs ── -->
    <nav class="mobile-tabs">
      <NuxtLink
        v-for="t in mobileTabs"
        :key="t.view"
        :to="`/${t.view}`"
        class="mobile-tab"
        :class="{ active: current === t.view }"
      >
        <BaseIcon :name="t.icon" :size="20" class="mtab-icon" />
        <span>{{ t.label }}</span>
      </NuxtLink>
      <button type="button" class="mobile-tab" :class="{ active: moreOpen }" @click="moreOpen = true">
        <BaseIcon name="menu" :size="20" class="mtab-icon" />
        <span>Mais</span>
      </button>
    </nav>

    <!-- ── Menu "Mais" (mobile) ── -->
    <AppSheet v-model:open="moreOpen">
      <div class="more-menu">
        <header class="more-head">
          <span class="more-title">Menu</span>
          <button type="button" class="more-close" aria-label="Fechar" @click="closeMore">
            <BaseIcon name="x" :size="18" />
          </button>
        </header>

        <div class="more-scroll">
          <div v-for="g in groups" :key="g.label" class="more-group">
            <span class="more-group-label">{{ g.label }}</span>
            <NuxtLink
              v-for="it in g.items"
              :key="it.view"
              :to="`/${it.view}`"
              class="more-link"
              :class="{ active: current === it.view }"
              @click="closeMore"
            >
              <BaseIcon :name="it.icon" :size="18" />
              <span class="more-link-label">{{ it.label }}</span>
              <span v-if="it.alert" class="nav-alert">{{ it.alert }}</span>
              <span v-else-if="it.count" class="nav-count">{{ it.count }}</span>
            </NuxtLink>
          </div>

          <div class="more-group">
            <span class="more-group-label">Conta</span>
            <NuxtLink
              v-for="f in footerLinks"
              :key="f.to"
              :to="f.to"
              class="more-link"
              @click="closeMore"
            >
              <BaseIcon :name="f.icon" :size="18" />
              <span class="more-link-label">{{ f.label }}</span>
            </NuxtLink>
            <button type="button" class="more-link" @click="openSync">
              <BaseIcon name="refresh-cw" :size="18" />
              <span class="more-link-label">Sincronização</span>
              <span v-if="syncCount" class="nav-count">{{ syncCount }}</span>
            </button>
          </div>
        </div>

        <footer class="more-foot">
          <div class="more-user">
            <span class="user-avatar">{{ userInitial }}</span>
            <span class="user-meta">
              <span class="user-name">{{ user?.name || 'Comando' }}</span>
              <span class="user-mail">{{ user?.email || '' }}</span>
            </span>
          </div>
          <button type="button" class="more-logout" @click="onLogout">
            <BaseIcon name="log-out" :size="17" />
            Sair
          </button>
        </footer>
      </div>
    </AppSheet>

    <TarefasTaskModal />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 248px 1fr;
  height: 100vh;
  height: 100dvh;
  background: var(--canvas);
  overflow: hidden;
  transition: grid-template-columns var(--dur-base) var(--ease-spring);
}
.app.rail-collapsed {
  grid-template-columns: 68px 1fr;
}

/* ── Sidebar ── */
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px 12px 12px;
  background: var(--sidebar-bg);
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── Brand ── */
.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 6px 14px 10px;
}
.brand {
  display: flex;
  align-items: center;
  text-decoration: none;
  outline: none;
  min-width: 0;
}
.brand-logo {
  height: 28px;
  width: auto;
  display: block;
  image-rendering: -webkit-optimize-contrast;
}
.brand-mark {
  display: none;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 15px;
  font-weight: 700;
  align-items: center;
  justify-content: center;
}
.brand:focus-visible {
  box-shadow: var(--shadow-focus);
  border-radius: var(--radius-sm);
}
.rail-toggle {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.rail-toggle:hover {
  background: var(--sidebar-item-hover);
  color: var(--text);
}

/* ── Nav ── */
.nav {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
  /* Rola internamente quando a viewport é baixa, em vez de transbordar os itens
     (Arquivo/Notas) por cima do rodapé (Configurações/Pessoas). */
  overflow-y: auto;
  overflow-x: hidden;
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-4);
  padding: 2px 12px 4px;
  background: transparent;
  cursor: pointer;
}
.nav-group-label:hover {
  color: var(--text-3);
}
.group-chevron {
  color: var(--text-4);
  transition: transform var(--dur-base) var(--ease-spring);
}
.group-chevron.rotated {
  transform: rotate(-90deg);
}
.nav-group-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.nav-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--text);
}
.nav-item.active {
  background: var(--sidebar-item-active);
  color: var(--text);
  box-shadow: var(--shadow-card);
}
.nav-icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.nav-item:hover .nav-icon,
.nav-item.active .nav-icon {
  color: var(--text);
}
.nav-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-count {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text-4);
  flex-shrink: 0;
}
.nav-item.active .nav-count {
  color: var(--text-3);
}
.nav-alert {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--danger);
  color: var(--accent-fg);
  flex-shrink: 0;
}

/* ── Sidebar footer ── */
.sidebar-foot {
  padding-top: 10px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  /* Mantém o rodapé sempre visível e ancorado; nunca encolhe nem sobrepõe a nav. */
  flex-shrink: 0;
}
.foot-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.foot-link:hover {
  background: var(--sidebar-item-hover);
  color: var(--text);
}
.foot-icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.foot-link:hover .foot-icon {
  color: var(--text);
}
.foot-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: inherit;
  border: 1px solid var(--border-faint);
  background: var(--sidebar-item-active);
  box-shadow: var(--shadow-card);
  font-family: inherit;
  font-size: inherit;
  text-align: left;
  cursor: pointer;
}
.user-chip:hover,
.user-chip.is-open {
  background: var(--sidebar-item-hover);
}
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
}
.user-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-mail {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-cog {
  flex-shrink: 0;
  color: var(--text-3);
}

/* ── Rail collapsed state ── */
.rail-collapsed .brand-logo,
.rail-collapsed .nav-label,
.rail-collapsed .nav-count,
.rail-collapsed .nav-alert,
.rail-collapsed .nav-group-label span,
.rail-collapsed .group-chevron,
.rail-collapsed .foot-label,
.rail-collapsed .user-meta,
.rail-collapsed .user-cog {
  display: none;
}
.rail-collapsed .brand-mark {
  display: inline-flex;
}
.rail-collapsed .brand-row {
  flex-direction: column;
  gap: 8px;
  padding: 2px 0 12px;
}
.rail-collapsed .nav-group-label {
  justify-content: center;
  padding: 2px 0 4px;
  pointer-events: none;
}
.rail-collapsed .nav-group-label::after {
  content: '';
  width: 16px;
  height: 1px;
  background: var(--border);
}
.rail-collapsed .nav-item,
.rail-collapsed .foot-link {
  justify-content: center;
  padding: 10px 0;
}
.rail-collapsed .user-chip {
  justify-content: center;
  padding: 8px 0;
}

/* ── Floating panel ── */
.panel {
  margin: 8px 8px 8px 0;
  background: var(--panel);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto 1fr;
}
.main {
  overflow: hidden;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr;
}
.view-wrap {
  height: 100%;
  overflow-y: auto;
  /* hidden: a página nunca rola na horizontal. O scroll-x do board é confinado
     ao próprio .board-scroll (overflow-x: auto lá dentro), então não precisa
     transbordar para a página. */
  overflow-x: hidden;
  background: var(--panel);
}

/* ── Mobile ── */
.mobile-tabs {
  display: none;
}
@media (max-width: 880px) {
  .app,
  .app.rail-collapsed {
    grid-template-columns: 1fr;
  }
  .sidebar {
    display: none;
  }
  .panel {
    margin: 0;
    border-radius: 0;
    box-shadow: none;
    grid-template-rows: auto auto 1fr;
  }
  .mobile-tabs {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--surface-glass-strong);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-top: 1px solid var(--border);
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    z-index: 20;
    justify-content: space-around;
  }
  .mobile-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 2px;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-3);
    text-align: center;
    border-radius: var(--radius-sm);
    text-decoration: none;
  }
  .mobile-tab .mtab-icon {
    width: 20px;
    height: 20px;
  }
  .mobile-tab.active {
    color: var(--accent);
  }
  .main {
    padding-bottom: 76px;
  }
}

/* ── Menu "Mais" (mobile sheet) ── */
.more-menu {
  display: flex;
  flex-direction: column;
  width: min(92vw, 420px);
  max-height: 88vh;
}
.more-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 10px;
}
.more-title {
  font-size: 17px;
  font-weight: 650;
  color: var(--text);
}
.more-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--surface-hover);
  color: var(--text-2);
  cursor: pointer;
}
.more-scroll {
  overflow-y: auto;
  padding: 4px 12px 8px;
}
.more-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
}
.more-group + .more-group {
  border-top: 1px solid var(--border);
}
.more-group-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-4);
  padding: 4px 10px;
}
.more-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  color: var(--text);
  text-decoration: none;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.more-link:active {
  background: var(--surface-hover);
}
.more-link.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.more-link-label {
  flex: 1;
}
.more-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
}
.more-user {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.more-logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--danger);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
</style>

<style>
/* Global: o menu de conta é teleportado pro body, fora do escopo scoped. */
.account-menu {
  position: fixed;
  z-index: 1000;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.account-menu .account-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  text-align: left;
  text-decoration: none;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s;
}
.account-menu .account-item:hover {
  background: var(--surface-hover);
}
.account-menu .account-item.danger {
  color: var(--danger);
}
.account-menu .account-item.danger:hover {
  background: rgba(220, 38, 38, 0.08);
}
.account-menu .account-ico {
  flex-shrink: 0;
  opacity: 0.85;
}
.account-menu .account-sep {
  height: 1px;
  margin: 4px 0;
  background: var(--border);
}
</style>

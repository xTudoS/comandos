<script setup lang="ts">
// /metas — per design-spec-comando.md §9.5
//
// Layout: clean-head com [+ Meta], BaseFilterPills [Todos] [Ativas]
// [Vencendo (30d)] [Vencidas] [Concluídas], lista de MetaCardExpandable.
// Ordenação: vencidas → ativas → concluídas; dentro de cada grupo por prazo
// (mais próximo primeiro), depois por título.

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Meta, StatusMeta } from '~/types/meta'

import { useMetasStore } from '~/stores/metas'
import { diasAtePrazo } from '~/composables/useStatus'
import { useUIStore } from '~/stores/ui'
import { useToast } from '~/composables/useToast'

import MetaPlanCard from '~/components/metas/MetaPlanCard.vue'
import MetaCalendar from '~/components/metas/MetaCalendar.vue'
import MetaTimeline from '~/components/metas/MetaTimeline.vue'
import ModalMeta from '~/components/modals/ModalMeta.vue'
import ModalMetaCascade, {
  type CascadeAction,
  type CascadeChildren,
} from '~/components/modals/ModalMetaCascade.vue'
import type { SavePayload } from '~/components/modals/ModalMeta.vue'

const metasStore = useMetasStore()
const uiStore = useUIStore()
const { list: companiesList, refresh: refreshCompanies } = useCompanies()
const { show: toast } = useToast()

// Não bloqueia a renderização: a página pinta na hora com "Carregando…" e os
// dados chegam em seguida. Antes, o await de topo suspendia o render via
// Suspense (a tela só aparecia depois do fetch).
metasStore.loading = true
onMounted(() => {
  Promise.all([metasStore.refresh(), refreshCompanies()]).catch(() => {})
})

const filtroEmpresa = ref<'all' | string>('all')

const empresaOptions = computed(() => [
  { value: 'all', label: 'Todas as empresas' },
  ...companiesList.value
    .filter((c) => !c.archived)
    .map((c) => ({ value: c.id, label: c.name })),
])

const { ativas: metas, loading } = storeToRefs(metasStore)
const { filtro_meta } = storeToRefs(uiStore)

const FILTROS: Array<{ value: string; label: string }> = [
  { value: 'ativas', label: 'Ativas' },
  { value: 'concluidas', label: 'Concluídas' },
  { value: 'todos', label: 'Todos' },
  { value: 'vencendo', label: 'Vencendo (30d)' },
  { value: 'vencidas', label: 'Vencidas' },
]

const buscaLocal = ref('')

function matchesBusca(m: Meta): boolean {
  const q = buscaLocal.value.trim().toLowerCase()
  if (!q) return true
  return (
    m.titulo.toLowerCase().includes(q) ||
    m.descricao.toLowerCase().includes(q)
  )
}

function matchesEmpresa(m: Meta): boolean {
  if (filtroEmpresa.value === 'all') return true
  return m.company_id === filtroEmpresa.value
}

interface MetaWithStatus {
  meta: Meta
  status: StatusMeta
}

function statusOf(m: Meta): StatusMeta {
  return metasStore.statusMeta(m)
}

const STATUS_ORDER: Record<StatusMeta, number> = {
  vencida: 0,
  ativa: 1,
  concluida: 2,
}

// Base filtrada só por busca+empresa (sem o filtro de status), enriquecida com
// o status. Grade aplica as pílulas por cima; Board/Calendário/Timeline usam a
// base direta (as próprias colunas/eixos já separam por status/prazo).
const baseFiltered = computed<MetaWithStatus[]>(() =>
  metas.value
    .filter((m) => matchesBusca(m) && matchesEmpresa(m))
    .map((m) => ({ meta: m, status: statusOf(m) })),
)

const visiveis = computed<MetaWithStatus[]>(() => {
  const enriched = baseFiltered.value

  switch (filtro_meta.value) {
    case 'ativas':
      return order(enriched.filter((r) => r.status === 'ativa'))
    case 'vencidas':
      return order(enriched.filter((r) => r.status === 'vencida'))
    case 'concluidas':
      return order(enriched.filter((r) => r.status === 'concluida'))
    case 'vencendo':
      return order(
        enriched.filter((r) => {
          if (r.status !== 'ativa') return false
          const d = diasAtePrazo(r.meta.prazo)
          return d !== null && d <= 30
        }),
      )
    default:
      return order(enriched)
  }
})

function order(rows: MetaWithStatus[]): MetaWithStatus[] {
  return rows.slice().sort((a, b) => {
    const aNew = metasStore.sessionNewIds[a.meta.id]
    const bNew = metasStore.sessionNewIds[b.meta.id]
    if (aNew && !bNew) return -1
    if (bNew && !aNew) return 1

    const sa = STATUS_ORDER[a.status]
    const sb = STATUS_ORDER[b.status]
    if (sa !== sb) return sa - sb
    const pa = a.meta.prazo ?? '9999-99-99'
    const pb = b.meta.prazo ?? '9999-99-99'
    if (pa !== pb) return pa < pb ? -1 : 1
    return a.meta.titulo.localeCompare(b.meta.titulo, 'pt')
  })
}

// Meta em destaque na Grade: primeira ativa, senão a primeira da lista.
const destaqueId = computed(() => {
  const ativa = visiveis.value.find((r) => r.status === 'ativa')
  return (ativa ?? visiveis.value[0])?.meta.id ?? null
})

// === Views (Grade / Board status / Board categoria / Calendário / Timeline) ===
type View = 'grade' | 'board-status' | 'board-cat' | 'calendario' | 'timeline'
const view = ref<View>('grade')
const VIEW_TABS: { value: View; label: string; icon: string }[] = [
  { value: 'grade', label: 'Grade', icon: 'layout-grid' },
  { value: 'board-status', label: 'Board · status', icon: 'kanban' },
  { value: 'board-cat', label: 'Board · categoria', icon: 'columns-3' },
  { value: 'calendario', label: 'Calendário', icon: 'calendar' },
  { value: 'timeline', label: 'Timeline', icon: 'gantt-chart' },
]
const VIEW_KEY = 'comando-metas-view-v1'
onMounted(() => {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw && VIEW_TABS.some((t) => t.value === raw)) view.value = raw as View
  } catch {
    // preferência indisponível — segue com o default (grade).
  }
})
watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // ignora (localStorage cheio/bloqueado)
  }
})

// Board por status (colunas = status derivado; somente-leitura, não arrastável).
const STATUS_COLUMNS: { status: StatusMeta; label: string; color: string }[] = [
  { status: 'vencida', label: 'Vencidas', color: 'var(--danger)' },
  { status: 'ativa', label: 'Ativas', color: 'var(--accent)' },
  { status: 'concluida', label: 'Concluídas', color: 'var(--success)' },
]
const boardStatus = computed(() =>
  STATUS_COLUMNS.map((c) => ({
    ...c,
    items: order(baseFiltered.value.filter((r) => r.status === c.status)),
  })),
)

// Board por categoria (arrastável — muda a categoria).
type CategoriaMeta = Meta['categoria']
const CATEGORIA_COLUMNS: { categoria: CategoriaMeta; label: string; color: string }[] = [
  { categoria: 'empresa', label: 'Empresas', color: 'var(--color-proj-empresa-fg)' },
  { categoria: 'produto', label: 'Produtos', color: 'var(--color-proj-produto-fg)' },
  { categoria: 'geral', label: 'Geral', color: 'var(--color-proj-geral-fg)' },
  { categoria: 'pessoal', label: 'Pessoal', color: 'var(--color-proj-pessoal-fg)' },
]
const boardCat = computed(() =>
  CATEGORIA_COLUMNS.map((c) => ({
    ...c,
    // BoardLane precisa de `id` em cada item (v-for + data-id do drag).
    items: order(baseFiltered.value.filter((r) => r.meta.categoria === c.categoria)).map(
      (r) => ({ id: r.meta.id, meta: r.meta, status: r.status }),
    ),
  })),
)

const boardKey = ref(0)
async function onDropCategoria(id: string, categoria: CategoriaMeta) {
  const m = metas.value.find((x) => x.id === id)
  if (!m || m.categoria === categoria) return
  boardKey.value++
  try {
    await metasStore.atualizar(id, { categoria })
    toast('Categoria atualizada')
  } catch (e) {
    toast((e as { message?: string })?.message ?? 'Não foi possível mudar a categoria.')
  }
}

// === Modal ===

const modalOpen = ref(false)
const editing = ref<Meta | null>(null)

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(m: Meta) {
  editing.value = m
  modalOpen.value = true
}

/**
 * `/metas?abrir=<id>` abre a meta direto — é como a agenda entrega o clique num
 * prazo. Sem isto o clique largaria o usuário na lista para procurar de novo.
 * A query é consumida (`replace`) para o F5 não reabrir o modal.
 */
const route = useRoute()
const router = useRouter()
watch(
  [() => route.query.abrir, () => metasStore.list.length],
  ([abrir]) => {
    if (typeof abrir !== 'string' || !abrir) return
    const alvo = metasStore.list.find((m) => m.id === abrir)
    if (!alvo) return
    openEdit(alvo)
    void router.replace({ path: '/metas' })
  },
  { immediate: true },
)

async function onSave(payload: SavePayload, isEdit: boolean) {
  try {
    if (isEdit && editing.value) {
      await metasStore.atualizar(editing.value.id, payload)
      toast('Meta atualizada')
    } else {
      await metasStore.criar(payload)
      toast('Meta criada')
    }
    modalOpen.value = false
  } catch (e) {
    toast((e as { message?: string })?.message ?? 'Falha ao salvar.')
  }
}

// === Ações destrutivas com cascata ===

const cascadeOpen = ref(false)
const cascadeAction = ref<CascadeAction>('archive')
const cascadeMeta = ref<Meta | null>(null)
const cascadeChildren = ref<CascadeChildren>({ projects: [], tasks: [] })
const cascadeLoading = ref(false)
const cascadeRef = ref<{ setSubmitting: (v: boolean) => void } | null>(null)

async function startCascade(m: Meta, action: CascadeAction) {
  cascadeAction.value = action
  cascadeMeta.value = m
  cascadeChildren.value = { projects: [], tasks: [] }
  cascadeOpen.value = true
  cascadeLoading.value = true
  try {
    cascadeChildren.value = await metasStore.listChildren(m.id)
  } catch (e) {
    toast((e as { message?: string })?.message ?? 'Falha ao buscar vinculados.')
    cascadeOpen.value = false
  } finally {
    cascadeLoading.value = false
  }
}

function onArquivar(m: Meta) {
  void startCascade(m, 'archive')
}

function onDeletar(m: Meta) {
  void startCascade(m, 'delete')
}

async function onCascadeConfirm(payload: { projectIds: string[]; taskIds: string[] }) {
  const m = cascadeMeta.value
  const action = cascadeAction.value
  if (!m) return
  cascadeRef.value?.setSubmitting(true)
  try {
    if (action === 'archive') {
      await metasStore.arquivar(m.id, true, payload)
      toast('Meta arquivada')
    } else {
      // await metasStore.deletar(m.id, payload)
      await metasStore.arquivar(m.id, true, payload)
      toast('Meta removida')
    }
    // Refresh em cascata para refletir filhos arquivados/desvinculados.
    await metasStore.refresh()
    cascadeOpen.value = false
  } catch (e) {
    toast((e as { message?: string })?.message ?? `Falha ao ${action === 'archive' ? 'arquivar' : 'apagar'}.`)
  } finally {
    cascadeRef.value?.setSubmitting(false)
  }
}

// === Expansão ===

function isExpanded(id: string): boolean {
  return uiStore.isMetaExpandida(id)
}

function toggleExpand(id: string) {
  uiStore.toggleMetaExpandida(id)
}
</script>

<template>
  <div class="clean-wrap">
    <header class="clean-head">
      <div class="clean-head__text">
        <h2 class="clean-head__title">Metas</h2>
        <p class="clean-head__desc">
          Objetivos com prazo. Tarefas e projetos ligados aqui se agregam no progresso.
        </p>
      </div>
      <div class="clean-head__actions">
        <BaseButton variant="primary" icon-left="plus" @click="openNew">
          Nova meta
        </BaseButton>
      </div>
    </header>

    <div class="view-row">
      <ViewTabs v-model="view" :tabs="VIEW_TABS" aria-label="Visualização" />
    </div>

    <div class="filtros-row">
      <BaseFilterPills
        v-if="view === 'grade'"
        v-model="filtro_meta"
        :options="FILTROS"
        aria-label="Filtrar metas por status"
      />
      <div class="empresa-wrap">
        <BaseSelect v-model="filtroEmpresa" :options="empresaOptions" />
      </div>
      <div class="busca-wrap">
        <BaseInput
          v-model="buscaLocal"
          variant="search"
          placeholder="Buscar título ou descrição…"
          aria-label="Buscar metas"
        />
      </div>
    </div>

    <ClientOnly>
      <template #fallback>
        <div class="empty-state">Carregando…</div>
      </template>

      <div v-if="loading && metas.length === 0" class="empty-state">Carregando…</div>

      <div v-else-if="metas.length === 0" class="empty-state">
        <BaseIcon name="sparkle" :size="36" class="es-icon" />
        <p>Nenhuma meta ainda. Clique em 'Nova meta' para começar.</p>
      </div>

      <!-- ── Grade (cards) ── -->
      <template v-else-if="view === 'grade'">
        <div v-if="visiveis.length === 0" class="empty-state">
          <BaseIcon name="sparkle" :size="36" class="es-icon" />
          <p>Nenhuma meta bate com o filtro.</p>
        </div>
        <div v-else class="plan-grid">
          <MetaPlanCard
            v-for="row in visiveis"
            :key="row.meta.id"
            :meta="row.meta"
            :status="row.status"
            :destaque="row.meta.id === destaqueId"
            @edit="openEdit"
            @arquivar="onArquivar"
            @deletar="onDeletar"
          />
        </div>
      </template>

      <!-- ── Board por status (somente-leitura; status é derivado) ── -->
      <div v-else-if="view === 'board-status'" class="board-scroll">
        <div class="board-track">
          <BoardLane
            v-for="col in boardStatus"
            :key="col.status"
            :lane-id="col.status"
            :label="col.label"
            :items="col.items.map((r) => r.meta)"
            :color="col.color"
            empty-label="Nenhuma meta"
          >
            <template #item="{ item }">
              <MetaPlanCard
                :meta="item"
                :status="col.status"
                compact
                @edit="openEdit"
                @arquivar="onArquivar"
                @deletar="onDeletar"
              />
            </template>
          </BoardLane>
        </div>
      </div>

      <!-- ── Board por categoria (arrastar muda a categoria) ── -->
      <div v-else-if="view === 'board-cat'" class="board-scroll">
        <div :key="boardKey" class="board-track">
          <BoardLane
            v-for="col in boardCat"
            :key="col.categoria"
            :lane-id="col.categoria"
            :label="col.label"
            :items="col.items"
            :color="col.color"
            group="meta-cat"
            empty-label="Arraste metas aqui"
            @drop-item="(id) => onDropCategoria(id, col.categoria)"
          >
            <template #item="{ item }">
              <MetaPlanCard
                :meta="item.meta"
                :status="item.status"
                compact
                @edit="openEdit"
                @arquivar="onArquivar"
                @deletar="onDeletar"
              />
            </template>
          </BoardLane>
        </div>
      </div>

      <!-- ── Calendário (por prazo) ── -->
      <MetaCalendar
        v-else-if="view === 'calendario'"
        :items="baseFiltered"
        @open="openEdit"
      />

      <!-- ── Timeline (por prazo) ── -->
      <MetaTimeline
        v-else
        :items="baseFiltered"
        @open="openEdit"
      />
    </ClientOnly>

    <ModalMeta
      v-model:open="modalOpen"
      :meta="editing"
      @save="onSave"
    />

    <ModalMetaCascade
      ref="cascadeRef"
      v-model:open="cascadeOpen"
      :action="cascadeAction"
      :meta-titulo="cascadeMeta?.titulo ?? ''"
      :children="cascadeChildren"
      :loading="cascadeLoading"
      @confirm="onCascadeConfirm"
    />
  </div>
</template>

<style scoped>
.clean-wrap {
  padding: 24px 26px 60px;
  max-width: 1480px;
  margin: 0 auto;
}

.clean-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.clean-head__text {
  min-width: 0;
}

.clean-head__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.022em;
  line-height: 1.15;
  color: var(--color-text);
}

.clean-head__desc {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.5;
  max-width: 62ch;
  color: var(--color-text-3);
}

.clean-head__actions {
  flex: 0 0 auto;
}

.filtros-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.empresa-wrap {
  min-width: 200px;
}
.busca-wrap {
  flex: 1;
  min-width: 240px;
  max-width: 360px;
  margin-left: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 20px;
  color: var(--text-3);
  font-size: 14px;
  text-align: center;
}
.es-icon { opacity: 0.5; }

/* ── Views ── */
.view-row {
  margin-bottom: 12px;
}
.board-scroll {
  width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 8px;
}
.board-track {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  width: max-content;
  min-width: 100%;
}

/* === Plan-style cards === */
.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
  align-items: start;
}
.plan-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 20px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: box-shadow var(--dur-base) var(--ease-spring),
              transform var(--dur-base) var(--ease-spring);
}
.plan-card:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-2px);
}
.plan-card.is-clickable {
  cursor: pointer;
}
.plan-card.is-clickable:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}
.plan-card.destaque {
  border: 1.5px solid transparent;
  background:
    linear-gradient(var(--surface), var(--surface)) padding-box,
    linear-gradient(135deg, #0a84ff, #bf5af2 55%, #ff9f0a) border-box;
  box-shadow: var(--shadow-card-hover);
}
.plan-flag {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--accent-fg);
  background: linear-gradient(135deg, #0a84ff, #bf5af2);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.plan-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-right: 64px;
}
.plan-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  line-height: 1.3;
}
.plan-status {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.plan-status.st-ativa { background: var(--accent-soft); color: var(--accent); }
.plan-status.st-vencida { background: var(--danger-bg); color: var(--danger); }
.plan-status.st-concluida { background: var(--success-bg); color: var(--success); }
.plan-card.destaque .plan-head { padding-right: 0; }
.plan-card.destaque .plan-status { display: none; }
.plan-desc {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plan-pct-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}
.plan-pct {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.plan-pct-sign { font-size: 16px; font-weight: 600; color: var(--text-3); margin-left: 1px; }
.plan-prazo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.plan-prazo.over { color: var(--danger); font-weight: 600; }
.plan-progress {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-hover);
  overflow: hidden;
}
.plan-progress > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent);
  transition: width var(--dur-base) var(--ease-spring);
}
.st-concluida .plan-progress > span { background: var(--success); }
.st-vencida .plan-progress > span { background: var(--danger); }
.plan-stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plan-stats li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.plan-stats li :deep(svg) { color: var(--text-4); flex-shrink: 0; }
.plan-foot {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  padding-top: 10px;
  margin-top: 2px;
  border-top: 1px solid var(--border-faint);
}
.plan-act {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  transition: background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring);
}
.plan-act:hover { background: var(--surface-hover); color: var(--text); }
.plan-act.danger:hover { background: var(--danger-bg); color: var(--danger); }

@media (max-width: 640px) {
  .filtros-row {
    flex-direction: column;
    align-items: stretch;
  }
  .busca-wrap {
    max-width: none;
    margin-left: 0;
  }
}
</style>

<script setup lang="ts">
// /projetos — per design-spec-comando.md §9.4
//
// Layout: clean-wrap → clean-head + BaseFilterPills agrupados por categoria
// (Empresas / Produtos / Geral / Pessoal). Em "Empresas" os produtos
// vinculados aparecem indentados como sub-cards (.is-sub).

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { CategoriaProjeto, Projeto } from '~/types/projeto'

import { useProjetosStore } from '~/stores/projetos'
import { useMetasStore } from '~/stores/metas'
import { useUIStore } from '~/stores/ui'
import { useToast } from '~/composables/useToast'
import { useConfirm } from '~/composables/useConfirm'

import ProjetoCard from '~/components/projetos/ProjetoCard.vue'
import ModalProjeto from '~/components/modals/ModalProjeto.vue'
import type { SavePayload } from '~/components/modals/ModalProjeto.vue'

const projetosStore = useProjetosStore()
const metasStore = useMetasStore()
const uiStore = useUIStore()
const { list: companiesList, refresh: refreshCompanies } = useCompanies()
const { show: toast } = useToast()
const { ask: askConfirm } = useConfirm()

// Não bloqueia a renderização: pinta a página com "Carregando…" e busca os
// dados no mount. Antes, o await de topo suspendia o render via Suspense.
projetosStore.loading = true
onMounted(() => {
  Promise.all([
    projetosStore.refresh(),
    metasStore.refresh(),
    refreshCompanies(),
  ]).catch(() => {})
})

const { ativos: projetos, loading } = storeToRefs(projetosStore)
const { ativas: metas } = storeToRefs(metasStore)
const { filtro_projeto } = storeToRefs(uiStore)

// Pílulas de filtro: 'todos' + categorias.
const FILTROS: Array<{ value: string; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'empresa', label: 'Empresas' },
  { value: 'produto', label: 'Produtos' },
  { value: 'geral', label: 'Geral' },
  { value: 'pessoal', label: 'Pessoal' },
]

// Ordem de exibição dos grupos.
const GRUPOS: Array<{ categoria: CategoriaProjeto; titulo: string }> = [
  { categoria: 'empresa', titulo: 'Empresas' },
  { categoria: 'produto', titulo: 'Produtos' },
  { categoria: 'geral', titulo: 'Geral' },
  { categoria: 'pessoal', titulo: 'Pessoal' },
]

const buscaLocal = ref('')
const filtroEmpresa = ref<'all' | string>('all')

const empresaOptions = computed(() => [
  { value: 'all', label: 'Todas as empresas' },
  ...companiesList.value
    .filter((c) => !c.archived)
    .map((c) => ({ value: c.id, label: c.name })),
])

function matchesBusca(p: Projeto): boolean {
  const q = buscaLocal.value.trim().toLowerCase()
  if (!q) return true
  return (
    p.nome.toLowerCase().includes(q) ||
    p.notas.toLowerCase().includes(q)
  )
}

function matchesEmpresa(p: Projeto): boolean {
  if (filtroEmpresa.value === 'all') return true
  return p.company_id === filtroEmpresa.value
}

const visiveis = computed(() =>
  projetos.value.filter((p) => matchesBusca(p) && matchesEmpresa(p)),
)

// Mapa empresa-id → produtos vinculados (apenas ativos e que casam com a busca).
const produtosPorEmpresa = computed(() => {
  const m = new Map<string, Projeto[]>()
  for (const p of visiveis.value) {
    if (p.categoria !== 'produto' || !p.empresa_id) continue
    const arr = m.get(p.empresa_id) ?? []
    arr.push(p)
    m.set(p.empresa_id, arr)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => {
      const aNew = projetosStore.sessionNewIds[a.id]
      const bNew = projetosStore.sessionNewIds[b.id]
      if (aNew && !bNew) return -1
      if (bNew && !aNew) return 1
      return a.nome.localeCompare(b.nome, 'pt')
    })
  }
  return m
})

// Para cada grupo aplicamos o filtro de pílulas (`todos` mostra todos).
function projetosNoGrupo(cat: CategoriaProjeto): Projeto[] {
  if (filtro_projeto.value !== 'todos' && filtro_projeto.value !== cat) return []
  let rows = visiveis.value.filter((p) => p.categoria === cat)
  // Em "Produtos", quando o filtro NÃO é 'produto' diretamente, escondemos os
  // produtos que já vão aparecer indentados sob suas empresas-pai. Quando o
  // usuário filtra por "produto" mostramos todos (inclui os com empresa-pai
  // como cards top-level normais para que o filtro seja útil).
  if (cat === 'produto' && filtro_projeto.value !== 'produto') {
    rows = rows.filter((p) => !p.empresa_id)
  }
  return rows.sort((a, b) => {
    const aNew = projetosStore.sessionNewIds[a.id]
    const bNew = projetosStore.sessionNewIds[b.id]
    if (aNew && !bNew) return -1
    if (bNew && !aNew) return 1
    return a.nome.localeCompare(b.nome, 'pt')
  })
}

const totalVisivel = computed(() =>
  GRUPOS.reduce((sum, g) => sum + projetosNoGrupo(g.categoria).length, 0),
)

// === Views (Lista / Board / Grade) ===
type View = 'lista' | 'board' | 'grade'
const view = ref<View>('lista')
const VIEW_TABS: { value: View; label: string; icon: string }[] = [
  { value: 'lista', label: 'Lista', icon: 'list' },
  { value: 'board', label: 'Board', icon: 'kanban' },
  { value: 'grade', label: 'Grade', icon: 'layout-grid' },
]
const VIEW_KEY = 'comando-projetos-view-v1'
onMounted(() => {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw && VIEW_TABS.some((t) => t.value === raw)) view.value = raw as View
  } catch {
    // preferência indisponível — segue com o default (lista).
  }
})
watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // ignora (localStorage cheio/bloqueado)
  }
})

// Cor da bolinha por categoria (tokens de projeto).
const CATEGORIA_COLOR: Record<CategoriaProjeto, string> = {
  empresa: 'var(--color-proj-empresa-fg)',
  produto: 'var(--color-proj-produto-fg)',
  geral: 'var(--color-proj-geral-fg)',
  pessoal: 'var(--color-proj-pessoal-fg)',
}

// Board/Grade usam a mesma base filtrada (busca + empresa), sem o filtro de
// pílulas (as colunas já separam por categoria; a grade mostra tudo).
const boardColumns = computed(() =>
  GRUPOS.map((g) => ({
    ...g,
    color: CATEGORIA_COLOR[g.categoria],
    items: visiveis.value
      .filter((p) => p.categoria === g.categoria)
      .sort((a, b) => {
        const aNew = projetosStore.sessionNewIds[a.id]
        const bNew = projetosStore.sessionNewIds[b.id]
        if (aNew && !bNew) return -1
        if (bNew && !aNew) return 1
        return a.nome.localeCompare(b.nome, 'pt')
      }),
  })),
)
const gradeItems = computed(() =>
  [...visiveis.value].sort((a, b) => {
    const aNew = projetosStore.sessionNewIds[a.id]
    const bNew = projetosStore.sessionNewIds[b.id]
    if (aNew && !bNew) return -1
    if (bNew && !aNew) return 1
    return a.nome.localeCompare(b.nome, 'pt')
  }),
)

// Arrastar um card para outra coluna muda a categoria. `atualizar` é online-first
// (não otimista), então bumpamos a key do board para o Vue reconstruir as colunas
// do estado atual e desfazer o movimento do SortableJS; no sucesso a reatividade
// recoloca o card na coluna nova. Em erro (ex.: 'pessoal' exige área da vida),
// o card volta ao lugar e mostramos um aviso.
const boardKey = ref(0)
async function onDropCategoria(id: string, categoria: CategoriaProjeto) {
  const p = projetos.value.find((x) => x.id === id)
  if (!p || p.categoria === categoria) return
  boardKey.value++
  try {
    await projetosStore.atualizar(id, { categoria })
    toast('Categoria atualizada')
  } catch (e) {
    toast((e as { message?: string })?.message ?? 'Não foi possível mudar a categoria.')
  }
}

// === Modal ===

const modalOpen = ref(false)
const editing = ref<Projeto | null>(null)

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(p: Projeto) {
  editing.value = p
  modalOpen.value = true
}

async function onSave(payload: SavePayload, isEdit: boolean) {
  try {
    if (isEdit && editing.value) {
      await projetosStore.atualizar(editing.value.id, payload)
      toast('Projeto atualizado')
    } else {
      await projetosStore.criar(payload)
      toast('Projeto criado')
    }
    modalOpen.value = false
  } catch (e) {
    toast((e as { message?: string })?.message ?? 'Falha ao salvar.')
  }
}

// === Ações destrutivas ===

function onArquivar(p: Projeto) {
  askConfirm(
    `Arquivar "${p.nome}"?`,
    async () => {
      await projetosStore.arquivar(p.id, true)
      toast('Projeto arquivado')
    },
    { titulo: 'Arquivar projeto', okLabel: 'Arquivar', okClass: 'warning' },
  )
}

function onDeletar(p: Projeto) {
  askConfirm(
    `Deletar "${p.nome}" permanentemente?\n\nEssa ação não pode ser desfeita.`,
    async () => {
      try {
        await projetosStore.deletar(p.id)
        toast('Projeto removido')
      } catch (e) {
        toast((e as { message?: string })?.message ?? 'Falha ao deletar.')
      }
    },
    { titulo: 'Deletar projeto', okLabel: 'Deletar', okClass: 'danger' },
  )
}

// === Expansão ===

function isExpanded(id: string): boolean {
  return uiStore.isProjetoExpandido(id)
}

function toggleExpand(id: string) {
  uiStore.toggleProjetoExpandido(id)
}
</script>

<template>
  <div class="clean-wrap">
    <header class="clean-head">
      <div class="clean-head__text">
        <h2 class="clean-head__title">Projetos</h2>
        <p class="clean-head__desc">
          Empresas, produtos e iniciativas pessoais.
        </p>
      </div>
      <div class="clean-head__actions">
        <BaseButton variant="primary" icon-left="plus" @click="openNew">
          Novo projeto
        </BaseButton>
      </div>
    </header>

    <div class="view-row">
      <ViewTabs v-model="view" :tabs="VIEW_TABS" aria-label="Visualização" />
    </div>

    <div class="filtros-row">
      <BaseFilterPills
        v-if="view === 'lista'"
        v-model="filtro_projeto"
        :options="FILTROS"
        aria-label="Filtrar projetos por categoria"
      />
      <div class="empresa-wrap">
        <BaseSelect v-model="filtroEmpresa" :options="empresaOptions" />
      </div>
      <div class="busca-wrap">
        <BaseInput
          v-model="buscaLocal"
          variant="search"
          placeholder="Buscar nome ou notas…"
          aria-label="Buscar projetos"
        />
      </div>
    </div>

    <ClientOnly>
      <template #fallback>
        <div class="empty-state">Carregando…</div>
      </template>

    <div v-if="loading && projetos.length === 0" class="empty-state">Carregando…</div>

    <div v-else-if="projetos.length === 0" class="empty-state">
      <BaseIcon name="sparkle" :size="36" class="es-icon" />
      <p>Nenhum projeto ainda. Clique em 'Novo projeto' para começar.</p>
    </div>

    <!-- ── Lista (agrupada por categoria) ── -->
    <template v-else-if="view === 'lista'">
      <div v-if="totalVisivel === 0" class="empty-state">
        <BaseIcon name="sparkle" :size="36" class="es-icon" />
        <p>Nenhum projeto bate com o filtro.</p>
      </div>
      <div v-else class="grupos">
        <section
          v-for="g in GRUPOS"
          v-show="projetosNoGrupo(g.categoria).length > 0"
          :key="g.categoria"
          class="projeto-grupo"
        >
          <h3 class="projeto-grupo__h">{{ g.titulo }}</h3>
          <div class="projeto-grupo__cards">
            <template v-for="p in projetosNoGrupo(g.categoria)" :key="p.id">
              <ProjetoCard
                :projeto="p"
                :open-task-count="projetosStore.taskCount(p.id)"
                :expanded="isExpanded(p.id)"
                @toggle="toggleExpand"
                @edit="openEdit"
                @arquivar="onArquivar"
                @deletar="onDeletar"
              />

              <!-- Em "Empresas" mostramos produtos vinculados como sub-cards. -->
              <ProjetoCard
                v-for="produto in g.categoria === 'empresa' ? produtosPorEmpresa.get(p.id) ?? [] : []"
                :key="`sub-${produto.id}`"
                :projeto="produto"
                :parent="p"
                :open-task-count="projetosStore.taskCount(produto.id)"
                :expanded="isExpanded(produto.id)"
                sub
                @toggle="toggleExpand"
                @edit="openEdit"
                @arquivar="onArquivar"
                @deletar="onDeletar"
              />
            </template>
          </div>
        </section>
      </div>
    </template>

    <!-- ── Board (Kanban por categoria; arrastar muda a categoria) ── -->
    <div v-else-if="view === 'board'" class="board-scroll">
      <div :key="boardKey" class="board-track">
        <BoardLane
          v-for="col in boardColumns"
          :key="col.categoria"
          :lane-id="col.categoria"
          :label="col.titulo"
          :items="col.items"
          :color="col.color"
          group="proj-cat"
          empty-label="Arraste projetos aqui"
          @drop-item="(id) => onDropCategoria(id, col.categoria)"
        >
          <template #item="{ item }">
            <ProjetoCard
              :projeto="item"
              :open-task-count="projetosStore.taskCount(item.id)"
              :expanded="isExpanded(item.id)"
              @toggle="toggleExpand"
              @edit="openEdit"
              @arquivar="onArquivar"
              @deletar="onDeletar"
            />
          </template>
        </BoardLane>
      </div>
    </div>

    <!-- ── Grade (cards flat) ── -->
    <template v-else>
      <div v-if="gradeItems.length === 0" class="empty-state">
        <BaseIcon name="sparkle" :size="36" class="es-icon" />
        <p>Nenhum projeto bate com o filtro.</p>
      </div>
      <div v-else class="grade-grid">
        <ProjetoCard
          v-for="p in gradeItems"
          :key="p.id"
          :projeto="p"
          :open-task-count="projetosStore.taskCount(p.id)"
          :expanded="isExpanded(p.id)"
          @toggle="toggleExpand"
          @edit="openEdit"
          @arquivar="onArquivar"
          @deletar="onDeletar"
        />
      </div>
    </template>
    </ClientOnly>

    <ModalProjeto
      v-model:open="modalOpen"
      :projeto="editing"
      :projetos="projetos"
      :metas="metas"
      @save="onSave"
    />
  </div>
</template>

<style scoped>
.clean-wrap {
  padding: 24px 26px 60px;
  max-width: 1480px;
  margin: 0 auto;
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

.view-row {
  margin-bottom: 12px;
}
.filtros-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

/* ── Board ── */
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

/* ── Grade ── */
.grade-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  align-items: start;
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

.grupos {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.projeto-grupo__h {
  margin: 0 0 8px;
  font-size: var(--fs-12);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-3);
}

.projeto-grupo__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

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

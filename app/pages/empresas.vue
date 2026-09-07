<script setup lang="ts">
import type { ActionItem } from '#ui/types'
import { computed, ref } from 'vue'
import type { Company } from '~/composables/useCompanies'

const { list, loading, refresh, create, update, archive, remove } = useCompanies()
const { ask } = useConfirm()
const { show: toast } = useToast()

const filtro = ref<'ativas' | 'arquivadas' | 'todas'>('ativas')
const buscaLocal = ref('')

async function reload() {
  await refresh({ includeArchived: true, withCounts: true })
}
// Não bloqueia a renderização: pinta a página com "Carregando…" e busca os
// dados no mount. Antes, o await de topo suspendia o render via Suspense.
loading.value = true
onMounted(() => {
  reload().catch(() => {})
})

const FILTROS: Array<{ value: string; label: string }> = [
  { value: 'ativas', label: 'Ativas' },
  { value: 'arquivadas', label: 'Arquivadas' },
  { value: 'todas', label: 'Todas' },
]

function matchesBusca(c: Company): boolean {
  const q = buscaLocal.value.trim().toLowerCase()
  if (!q) return true
  return c.name.toLowerCase().includes(q)
}

const visiveis = computed(() => {
  let rows = list.value.filter(matchesBusca)
  if (filtro.value === 'ativas') rows = rows.filter((c) => !c.archived)
  else if (filtro.value === 'arquivadas') rows = rows.filter((c) => c.archived)
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt'))
})

// === Criar ===

const novoNome = ref('')
const criando = ref(false)
const criarErr = ref<string | null>(null)

async function onCriar() {
  const nome = novoNome.value.trim()
  if (!nome) return
  criando.value = true
  criarErr.value = null
  try {
    await create(nome)
    novoNome.value = ''
    toast('Empresa criada')
    await reload()
  } catch (e) {
    criarErr.value = (e as { message?: string })?.message ?? 'Falha ao criar.'
  } finally {
    criando.value = false
  }
}

// === Renomear inline ===

const editingId = ref<string | null>(null)
const editingText = ref('')
const editingBusy = ref(false)

function startEdit(c: Company) {
  editingId.value = c.id
  editingText.value = c.name
}
function cancelEdit() {
  editingId.value = null
  editingText.value = ''
}
async function commitEdit() {
  const id = editingId.value
  if (!id) return
  const text = editingText.value.trim()
  const current = list.value.find((c) => c.id === id)
  if (!text || !current || text === current.name) {
    cancelEdit()
    return
  }
  editingBusy.value = true
  try {
    await update(id, { name: text })
    toast('Empresa renomeada')
  } catch (e) {
    toast((e as { message?: string })?.message ?? 'Falha ao renomear.')
  } finally {
    editingBusy.value = false
    editingId.value = null
  }
}

// === Ações ===

function actionsFor(c: Company): ActionItem[] {
  return [
    { key: 'edit', label: 'Renomear', icon: 'pencil' },
    {
      key: 'archive',
      label: c.archived ? 'Desarquivar' : 'Arquivar',
      icon: 'archive',
      tone: 'warning',
    },
    { key: 'delete', label: 'Apagar', icon: 'trash-2', tone: 'danger' },
  ]
}

function onAction(key: string, c: Company) {
  if (key === 'edit') startEdit(c)
  else if (key === 'archive') onArchive(c)
  else if (key === 'delete') onDelete(c)
}

function onArchive(c: Company) {
  const next = !c.archived
  ask(
    next ? `Arquivar "${c.name}"?` : `Desarquivar "${c.name}"?`,
    async () => {
      try {
        await archive(c.id, next)
        toast(next ? 'Empresa arquivada' : 'Empresa desarquivada')
        await reload()
      } catch (e) {
        toast((e as { message?: string })?.message ?? 'Falha ao arquivar.')
      }
    },
    {
      titulo: next ? 'Arquivar empresa' : 'Desarquivar empresa',
      okLabel: next ? 'Arquivar' : 'Desarquivar',
      okClass: 'warning',
    },
  )
}

function onDelete(c: Company) {
  const counts = c.counts
  const links =
    counts && (counts.taskTotal > 0 || counts.projectTotal > 0 || counts.goalTotal > 0)
      ? `\n\nTarefas/projetos/metas vinculados serão automaticamente desvinculados (não removidos).`
      : ''
  ask(
    `Apagar "${c.name}" permanentemente?${links}`,
    async () => {
      try {
        await remove(c.id)
        toast('Empresa removida')
        await reload()
      } catch (e) {
        toast((e as { message?: string })?.message ?? 'Falha ao apagar.')
      }
    },
    { titulo: 'Apagar empresa', okLabel: 'Apagar', okClass: 'danger' },
  )
}

function onEditKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    void commitEdit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  }
}
</script>

<template>
  <div class="clean-wrap">
    <header class="clean-head">
      <div class="clean-head__text">
        <h2 class="clean-head__title">Empresas</h2>
        <p class="clean-head__desc">
          Catálogo central. Vincule tarefas, metas e projetos a uma empresa para
          manter tudo sincronizado.
        </p>
      </div>
    </header>

    <div class="quick-add">
      <BaseInput
        v-model="novoNome"
        placeholder="Nome da empresa…"
        @keydown.enter="onCriar"
      />
      <BaseButton
        variant="primary"
        icon-left="plus"
        :loading="criando"
        :disabled="!novoNome.trim()"
        @click="onCriar"
      >
        Adicionar
      </BaseButton>
    </div>
    <div v-if="criarErr" class="quick-err">{{ criarErr }}</div>

    <div class="filtros-row">
      <BaseFilterPills
        v-model="filtro"
        :options="FILTROS"
        aria-label="Filtrar empresas"
      />
      <div class="busca-wrap">
        <BaseInput
          v-model="buscaLocal"
          variant="search"
          placeholder="Buscar empresa…"
          aria-label="Buscar empresas"
        />
      </div>
    </div>

    <BaseEmptyState
      v-if="loading && list.length === 0"
      message="Carregando…"
    />

    <BaseEmptyState
      v-else-if="list.length === 0"
      icon="building-2"
      message="Nenhuma empresa ainda. Adicione a primeira acima."
      big
    />

    <BaseEmptyState
      v-else-if="visiveis.length === 0"
      icon="search"
      message="Nenhuma empresa bate com o filtro."
    />

    <ul v-else class="empresas-list">
      <li
        v-for="c in visiveis"
        :key="c.id"
        class="empresa"
        :class="{ archived: c.archived }"
      >
        <BaseIcon name="building-2" :size="16" class="emp-ico" />
        <div class="emp-name">
          <input
            v-if="editingId === c.id"
            v-model="editingText"
            type="text"
            class="emp-input"
            autofocus
            :disabled="editingBusy"
            @keydown="onEditKey"
            @blur="commitEdit"
          />
          <span v-else class="emp-name-text" @click="startEdit(c)">
            {{ c.name }}
            <span v-if="c.archived" class="emp-archived">arquivada</span>
          </span>
        </div>
        <div class="emp-counts" v-if="c.counts">
          <span
            v-if="c.counts.taskTotal > 0"
            class="emp-count"
            :title="`${c.counts.taskOpen} aberta${c.counts.taskOpen === 1 ? '' : 's'} de ${c.counts.taskTotal}`"
          >
            <BaseIcon name="check-square" :size="11" />
            {{ c.counts.taskOpen }}/{{ c.counts.taskTotal }}
          </span>
          <span
            v-if="c.counts.projectTotal > 0"
            class="emp-count"
          >
            <BaseIcon name="folder" :size="11" />
            {{ c.counts.projectTotal }}
          </span>
          <span
            v-if="c.counts.goalTotal > 0"
            class="emp-count"
          >
            <BaseIcon name="target" :size="11" />
            {{ c.counts.goalTotal }}
          </span>
          <span
            v-if="
              c.counts.taskTotal === 0 &&
              c.counts.projectTotal === 0 &&
              c.counts.goalTotal === 0
            "
            class="emp-empty-counts"
          >
            sem vínculos
          </span>
        </div>
        <div class="emp-menu" @click.stop>
          <BaseActionMenu
            :items="actionsFor(c)"
            aria-label="Ações da empresa"
            @select="(k) => onAction(k, c)"
          />
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.clean-wrap {
  padding: 24px 26px 60px;
  max-width: 1480px;
  margin: 0 auto;
}

.clean-head {
  margin-bottom: 20px;
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

.quick-add {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  align-items: center;
}
.quick-add > :first-child {
  flex: 1;
}

.quick-err {
  font-size: var(--fs-12);
  color: var(--color-danger);
  margin-bottom: 10px;
}

.filtros-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 14px 0 14px;
  flex-wrap: wrap;
}

.busca-wrap {
  flex: 1;
  min-width: 240px;
  max-width: 360px;
  margin-left: auto;
}

.empresas-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empresa {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.empresa:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-card-hover);
}
.empresa.archived {
  opacity: 0.6;
}

.emp-ico {
  color: var(--color-text-3);
}

.emp-name {
  min-width: 0;
}
.emp-name-text {
  font-size: var(--fs-14);
  color: var(--color-text);
  cursor: text;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.emp-archived {
  font-size: var(--fs-10);
  color: var(--color-text-3);
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.emp-input {
  width: 100%;
  font-size: var(--fs-14);
  padding: 4px 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  font-family: inherit;
  background: var(--color-surface);
  color: var(--color-text);
}
.emp-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.emp-counts {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.emp-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-11);
  font-weight: var(--fw-medium);
  color: var(--color-text-3);
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}
.emp-empty-counts {
  font-size: var(--fs-11);
  color: var(--color-text-4);
  font-style: italic;
}

.emp-menu {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}
.empresa:hover .emp-menu,
.emp-menu:focus-within {
  opacity: 1;
}
@media (max-width: 780px) {
  .emp-menu {
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .empresa {
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto;
  }
  .emp-counts {
    grid-column: 2 / 4;
    grid-row: 2;
    flex-wrap: wrap;
  }
  .emp-menu {
    grid-row: 1;
  }
}
</style>

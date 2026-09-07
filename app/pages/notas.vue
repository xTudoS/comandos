<script setup lang="ts">
// /notas — per design-spec-comando.md §9.6
//
// Layout: clean-wrap → clean-head + BaseFilterPills + grid auto-fill
// minmax(280px,1fr) com NotaCard (mais recentes primeiro).

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Nota, TipoNota } from '~/types/nota'

import { useNotesStore } from '~/stores/notes'
import { useProjetosStore } from '~/stores/projetos'
import { useUIStore } from '~/stores/ui'
import { useToast } from '~/composables/useToast'
import { useConfirm } from '~/composables/useConfirm'

import type { SavePayload } from '~/components/modals/ModalNota.vue'

const notesStore = useNotesStore()
const projetosStore = useProjetosStore()
const uiStore = useUIStore()
const { state: _toastState, show: toast } = useToast()
const { ask: askConfirm } = useConfirm()

// Não bloqueia a renderização: pinta a página com "Carregando…" e busca os
// dados no mount. Antes, o await de topo suspendia o render via Suspense.
notesStore.loading = true
onMounted(() => {
  Promise.all([notesStore.refresh(), projetosStore.refresh()]).catch(() => {})
})

const { ativas: notas, loading } = storeToRefs(notesStore)
const { filtro_nota_full } = storeToRefs(uiStore)

// Pílulas de filtro: 'todos' + tipos.
const FILTROS: Array<{ value: string; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'Playbook', label: 'Playbooks' },
  { value: 'Credencial', label: 'Credenciais' },
  { value: 'Contato', label: 'Contatos' },
  { value: 'Decisão', label: 'Decisões' },
  { value: 'Referência', label: 'Referências' },
]

const buscaLocal = ref('')

const visiveis = computed(() => {
  let rows = notas.value.slice()
  if (filtro_nota_full.value !== 'todos') {
    const tipo = filtro_nota_full.value as TipoNota
    rows = rows.filter((n) => n.tipo === tipo)
  }
  const q = buscaLocal.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (n) =>
        n.titulo.toLowerCase().includes(q) ||
        n.corpo.toLowerCase().includes(q),
    )
  }
  // Mais recentes primeiro.
  rows.sort((a, b) => (a.atualizada_em < b.atualizada_em ? 1 : -1))
  return rows
})

// === 2-pane reader: seleção ===
const selectedId = ref<string | null>(null)
const selected = computed(
  () => visiveis.value.find((n) => n.id === selectedId.value) ?? visiveis.value[0] ?? null,
)
watch(
  visiveis,
  (rows) => {
    if (!rows.some((n) => n.id === selectedId.value)) {
      selectedId.value = rows[0]?.id ?? null
    }
  },
  { immediate: true },
)

const TIPO_DOT: Record<TipoNota, string> = {
  Playbook: 'var(--color-nota-playbook)',
  Credencial: 'var(--color-nota-credencial)',
  Contato: 'var(--color-nota-contato)',
  'Decisão': 'var(--color-nota-decisao)',
  'Referência': 'var(--color-nota-referencia)',
}

function snippet(n: Nota): string {
  const c = (n.corpo ?? '').trim()
  return c.length > 96 ? c.slice(0, 96) + '…' : c
}

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  } catch {
    return ''
  }
}

const emptyMessage = computed(() =>
  notas.value.length === 0
    ? "Nenhuma nota ainda. Clique em 'Nova nota' para começar."
    : 'Nenhuma nota bate com o filtro.',
)

// === Modal ===

const modalOpen = ref(false)
const editing = ref<Nota | null>(null)

function openNew() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(n: Nota) {
  editing.value = n
  modalOpen.value = true
}

async function onSave(payload: SavePayload, isEdit: boolean) {
  try {
    if (isEdit && editing.value) {
      await notesStore.atualizar(editing.value.id, payload)
      toast('Nota atualizada')
    } else {
      await notesStore.criar(payload)
      toast('Nota criada')
    }
    modalOpen.value = false
  } catch (e) {
    toast((e as { message?: string })?.message ?? 'Falha ao salvar.')
  }
}

// === Ações destrutivas ===

function onArquivar(n: Nota) {
  askConfirm(
    `Arquivar "${n.titulo}"?`,
    async () => {
      await notesStore.arquivar(n.id, true)
      toast('Nota arquivada')
    },
    { titulo: 'Arquivar nota', okLabel: 'Arquivar', okClass: 'warning' },
  )
}

function onDeletar(n: Nota) {
  askConfirm(
    `Deletar "${n.titulo}" permanentemente?\n\nEssa ação não pode ser desfeita.`,
    async () => {
      await notesStore.deletar(n.id)
      toast('Nota removida')
    },
    { titulo: 'Deletar nota', okLabel: 'Deletar', okClass: 'danger' },
  )
}

// === Expansão ===

function isExpanded(id: string): boolean {
  return uiStore.isNotaExpandida(id)
}

function toggleExpand(id: string) {
  uiStore.toggleNotaExpandida(id)
}
</script>

<template>
  <div class="clean-wrap">
    <header class="clean-head">
      <div class="clean-head__text">
        <h2 class="clean-head__title">Notas</h2>
        <p class="clean-head__desc">
          Playbooks, credenciais, contatos, decisões e referências.
        </p>
      </div>
      <div class="clean-head__actions">
        <BaseButton variant="primary" icon-left="plus" @click="openNew">
          Nova nota
        </BaseButton>
      </div>
    </header>

    <div class="filtros-row">
      <BaseFilterPills
        v-model="filtro_nota_full"
        :options="FILTROS"
        aria-label="Filtrar notas por tipo"
      />
      <div class="busca-wrap">
        <BaseInput
          v-model="buscaLocal"
          variant="search"
          placeholder="Buscar título ou conteúdo…"
          aria-label="Buscar notas"
        />
      </div>
    </div>

    <ClientOnly>
      <template #fallback>
        <div class="empty-state">Carregando…</div>
      </template>

    <div v-if="loading && visiveis.length === 0" class="empty-state">Carregando…</div>

    <div v-else-if="visiveis.length === 0" class="empty-state">
      <BaseIcon name="sparkle" :size="36" class="es-icon" />
      <p>{{ emptyMessage }}</p>
    </div>

    <div v-else class="reader">
      <!-- Lista (esquerda) -->
      <aside class="reader-list">
        <ul class="rl-items">
          <li
            v-for="n in visiveis"
            :key="n.id"
            class="note-item"
            :class="{ active: selected?.id === n.id }"
            @click="selectedId = n.id"
          >
            <span class="ni-dot" :style="{ background: TIPO_DOT[n.tipo] }" />
            <div class="ni-main">
              <div class="ni-top">
                <span class="ni-title">{{ n.titulo }}</span>
                <span class="ni-when">{{ fmtWhen(n.atualizada_em) }}</span>
              </div>
              <div v-if="snippet(n)" class="ni-snippet">{{ snippet(n) }}</div>
              <div class="ni-meta">
                <span class="ni-type">{{ n.tipo }}</span>
                <span
                  v-if="projetosStore.byId(n.projeto_id)"
                  class="ni-proj"
                >{{ projetosStore.byId(n.projeto_id)?.nome }}</span>
                <span v-if="n.status === 'Rascunho'" class="ni-draft">Rascunho</span>
              </div>
            </div>
          </li>
        </ul>
      </aside>

      <!-- Leitor (direita) -->
      <section v-if="selected" class="reader-detail">
        <header class="rd-head">
          <div class="rd-head-main">
            <span class="rd-dot" :style="{ background: TIPO_DOT[selected.tipo] }" />
            <div class="rd-titles">
              <h3 class="rd-title">{{ selected.titulo }}</h3>
              <div class="rd-sub">
                <span class="rd-type">{{ selected.tipo }}</span>
                <span
                  v-if="projetosStore.byId(selected.projeto_id)"
                  class="rd-proj"
                >· {{ projetosStore.byId(selected.projeto_id)?.nome }}</span>
                <span class="rd-when">· atualizada {{ fmtWhen(selected.atualizada_em) }}</span>
              </div>
            </div>
          </div>
          <div class="rd-actions">
            <button type="button" class="rd-act" aria-label="Editar" title="Editar" @click="openEdit(selected)">
              <BaseIcon name="pencil" :size="16" />
            </button>
            <button type="button" class="rd-act" aria-label="Arquivar" title="Arquivar" @click="onArquivar(selected)">
              <BaseIcon name="archive" :size="16" />
            </button>
            <button type="button" class="rd-act danger" aria-label="Apagar" title="Apagar" @click="onDeletar(selected)">
              <BaseIcon name="trash-2" :size="16" />
            </button>
          </div>
        </header>
        <div class="rd-body">{{ selected.corpo || 'Sem conteúdo.' }}</div>
      </section>
      <section v-else class="reader-detail rd-empty">
        <BaseIcon name="file-text" :size="40" />
        <p>Selecione uma nota para ler.</p>
      </section>
    </div>
    </ClientOnly>

    <ModalNota
      v-model:open="modalOpen"
      :nota="editing"
      :projetos="projetosStore.list"
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

/* === 2-pane reader === */
.reader {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 14px;
  height: calc(100dvh - 240px);
  min-height: 440px;
}

.reader-list {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  overflow-y: auto;
  overflow-x: hidden;
}
.rl-items {
  list-style: none;
  margin: 0;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.note-item {
  display: flex;
  gap: 10px;
  padding: 12px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-spring);
}
.note-item:hover {
  background: var(--surface-hover);
}
.note-item.active {
  background: var(--accent-soft);
}
.ni-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
}
.ni-main {
  min-width: 0;
  flex: 1;
}
.ni-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.ni-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ni-when {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.ni-snippet {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ni-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.ni-type {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-3);
}
.ni-proj {
  font-size: 10px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
.ni-draft {
  font-size: 10px;
  font-style: italic;
  color: var(--text-3);
  background: var(--surface-hover);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
}

.reader-detail {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.rd-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}
.rd-head-main {
  display: flex;
  gap: 12px;
  min-width: 0;
}
.rd-dot {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 8px;
}
.rd-titles { min-width: 0; }
.rd-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}
.rd-sub {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-3);
}
.rd-type {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-2);
}
.rd-proj { color: var(--accent); }
.rd-actions {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
}
.rd-act {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  transition: background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring);
}
.rd-act:hover { background: var(--surface-hover); color: var(--text); }
.rd-act.danger:hover { background: var(--danger-bg); color: var(--danger); }
.rd-body {
  padding: 20px 24px 28px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text);
  white-space: pre-wrap;
  flex: 1;
}
.rd-empty {
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-3);
}

@media (max-width: 760px) {
  .reader {
    grid-template-columns: 1fr;
    height: auto;
  }
  .reader-detail { min-height: 360px; }
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

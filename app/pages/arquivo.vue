<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { Task } from '~/composables/useTasks'
import type { Project } from '~/composables/useProjects'
import type { Note } from '~/composables/useNotes'
import type { Payment } from '~/composables/usePayments'
import { formatBRL } from '~/utils/money'
import { fmtBRDate } from '~/utils/dates'
type EntityKind = 'task' | 'project' | 'note' | 'payment'
type Filter = 'all' | EntityKind

const filter = ref<Filter>('all')
const layout = ref<'list' | 'grid'>('list')

const loading = ref(false)
const error = ref<string | null>(null)

const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const notes = ref<Note[]>([])
const payments = ref<Payment[]>([])

async function refresh() {
  loading.value = true
  error.value = null
  try {
    const [tr, pr, nr, pmr] = await Promise.all([
      $fetch<{ tasks: Task[] }>('/api/tasks', { query: { includeArchived: '1' } }),
      $fetch<{ projects: Project[] }>('/api/projects', { query: { includeArchived: '1' } }),
      $fetch<{ notes: Note[] }>('/api/notes', { query: { includeArchived: '1' } }),
      $fetch<{ payments: Payment[] }>('/api/payments', { query: { includeArchived: '1' } }),
    ])
    tasks.value = tr.tasks.filter((t) => t.archived)
    projects.value = pr.projects.filter((p) => p.archived)
    notes.value = nr.notes.filter((n) => n.archived)
    payments.value = pmr.payments.filter((p) => p.archived)
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao carregar arquivo.'
  } finally {
    loading.value = false
  }
}

// Não bloqueia a renderização: pinta a página com "Carregando…" e busca os
// dados no mount. Antes, o await de topo suspendia o render via Suspense.
loading.value = true
onMounted(() => {
  refresh().catch(() => {})
})

type Item = {
  kind: EntityKind
  id: string
  title: string
  sub: string
  author: string | null
  updatedAt: string
}

const items = computed<Item[]>(() => {
  const out: Item[] = []
  if (filter.value === 'all' || filter.value === 'task') {
    for (const t of tasks.value) {
      out.push({
        kind: 'task',
        id: t.id,
        title: t.title,
        sub: t.delegatePersonName ? `Delegada · ${t.delegatePersonName}` : t.horizon,
        author: t.createdByName ?? null,
        updatedAt: t.updatedAt,
      })
    }
  }
  if (filter.value === 'all' || filter.value === 'project') {
    for (const p of projects.value) {
      out.push({
        kind: 'project',
        id: p.id,
        title: p.name,
        sub: p.category,
        author: null,
        updatedAt: p.updatedAt,
      })
    }
  }
  if (filter.value === 'all' || filter.value === 'note') {
    for (const n of notes.value) {
      out.push({
        kind: 'note',
        id: n.id,
        title: n.title,
        sub: n.type,
        author: null,
        updatedAt: n.updatedAt,
      })
    }
  }
  if (filter.value === 'all' || filter.value === 'payment') {
    for (const p of payments.value) {
      out.push({
        kind: 'payment',
        id: p.id,
        title: p.description,
        sub: formatBRL(p.amountCents),
        author: null,
        updatedAt: p.updatedAt,
      })
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
})

const counts = computed(() => ({
  task: tasks.value.length,
  project: projects.value.length,
  note: notes.value.length,
  payment: payments.value.length,
}))
const totalCount = computed(
  () => counts.value.task + counts.value.project + counts.value.note + counts.value.payment,
)

const KIND_META: Record<EntityKind | 'all', { label: string; icon: string; tone: string }> = {
  all: { label: 'Todos', icon: 'layers', tone: 'accent' },
  task: { label: 'Tarefas', icon: 'square-check-big', tone: 'delegate' },
  project: { label: 'Projetos', icon: 'folder', tone: 'project' },
  note: { label: 'Notas', icon: 'file-text', tone: 'note' },
  payment: { label: 'Pagamentos', icon: 'dollar-sign', tone: 'payment' },
}

const folders = computed(() => [
  { key: 'all' as const, ...KIND_META.all, count: totalCount.value },
  { key: 'task' as const, ...KIND_META.task, count: counts.value.task },
  { key: 'project' as const, ...KIND_META.project, count: counts.value.project },
  { key: 'note' as const, ...KIND_META.note, count: counts.value.note },
  { key: 'payment' as const, ...KIND_META.payment, count: counts.value.payment },
])

// ── Seleção em massa ─────────────────────────────────────
const selected = reactive<Set<string>>(new Set())
const keyOf = (it: Item) => `${it.kind}-${it.id}`
function toggleSel(it: Item) {
  const k = keyOf(it)
  if (selected.has(k)) selected.delete(k)
  else selected.add(k)
}
const allSelected = computed(
  () => items.value.length > 0 && items.value.every((it) => selected.has(keyOf(it))),
)
function toggleAll() {
  if (allSelected.value) selected.clear()
  else for (const it of items.value) selected.add(keyOf(it))
}
const selectedItems = computed(() => items.value.filter((it) => selected.has(keyOf(it))))
function clearSel() {
  selected.clear()
}

// ── Ações ────────────────────────────────────────────────
const ENDPOINT: Record<EntityKind, string> = {
  task: 'tasks',
  project: 'projects',
  note: 'notes',
  payment: 'payments',
}

async function restoreOne(it: Item) {
  await $fetch(`/api/${ENDPOINT[it.kind]}/${it.id}/archive`, {
    method: 'POST',
    body: { archived: false },
  })
}
async function deleteOne(it: Item) {
  await $fetch(`/api/${ENDPOINT[it.kind]}/${it.id}`, { method: 'DELETE' })
}

async function onRestore(it: Item) {
  try {
    await restoreOne(it)
    selected.delete(keyOf(it))
    await refresh()
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao restaurar.'
  }
}
async function onDelete(it: Item) {
  if (!confirm(`Deletar "${it.title}" permanentemente? Esta ação não pode ser desfeita.`)) return
  try {
    await deleteOne(it)
    selected.delete(keyOf(it))
    await refresh()
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao deletar.'
  }
}

async function bulkRestore() {
  try {
    await Promise.all(selectedItems.value.map(restoreOne))
    clearSel()
    await refresh()
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao restaurar.'
  }
}
async function bulkDelete() {
  const n = selectedItems.value.length
  if (!confirm(`Deletar ${n} item${n === 1 ? '' : 's'} permanentemente? Esta ação não pode ser desfeita.`))
    return
  try {
    await Promise.all(selectedItems.value.map(deleteOne))
    clearSel()
    await refresh()
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao deletar.'
  }
}
</script>

<template>
  <div class="arq-page">
    <div class="arq-head">
      <div class="arq-titlebar">
        <h1 class="arq-title">Arquivo</h1>
        <ViewTabs
          v-model="layout"
          :tabs="[
            { value: 'list', label: 'Lista', icon: 'list' },
            { value: 'grid', label: 'Grade', icon: 'layout-grid' },
          ]"
          aria-label="Layout"
        />
      </div>
      <p class="arq-desc">
        Tudo arquivado. Restaure itens ou exclua-os em definitivo.
      </p>
    </div>

    <!-- Pastas (por tipo de entidade) -->
    <section class="arq-folders" aria-label="Pastas">
      <button
        v-for="f in folders"
        :key="f.key"
        type="button"
        class="folder"
        :class="[`tone-${f.tone}`, { active: filter === f.key }]"
        @click="filter = f.key"
      >
        <span class="folder-ico"><BaseIcon :name="f.icon" :size="22" /></span>
        <span class="folder-name">{{ f.label }}</span>
        <span class="folder-meta">{{ f.count }} item{{ f.count === 1 ? '' : 's' }}</span>
      </button>
    </section>

    <div v-if="error" class="arq-error">{{ error }}</div>

    <div v-if="loading && items.length === 0" class="arq-empty">Carregando…</div>
    <div v-else-if="items.length === 0" class="arq-empty">
      <BaseIcon name="archive" :size="34" class="ae-ico" />
      <span>Nada arquivado{{ filter === 'all' ? ' ainda' : '' }}.</span>
    </div>

    <!-- ── Tabela (Lista) ── -->
    <div v-else-if="layout === 'list'" class="arq-table">
      <div class="arq-row arq-row--head">
        <span class="c-check">
          <button
            type="button"
            class="checkbox"
            :class="{ on: allSelected }"
            role="checkbox"
            :aria-checked="allSelected"
            aria-label="Selecionar todos"
            @click="toggleAll"
          >
            <BaseIcon v-if="allSelected" name="check" :size="12" />
          </button>
        </span>
        <span class="c-name">Nome</span>
        <span class="c-type">Tipo</span>
        <span class="c-author">Adicionado por</span>
        <span class="c-date">Atualizado em</span>
        <span class="c-actions">Ações</span>
      </div>

      <div
        v-for="it in items"
        :key="keyOf(it)"
        class="arq-row"
        :class="{ sel: selected.has(keyOf(it)) }"
      >
        <span class="c-check">
          <button
            type="button"
            class="checkbox"
            :class="{ on: selected.has(keyOf(it)) }"
            role="checkbox"
            :aria-checked="selected.has(keyOf(it))"
            :aria-label="`Selecionar ${it.title}`"
            @click="toggleSel(it)"
          >
            <BaseIcon v-if="selected.has(keyOf(it))" name="check" :size="12" />
          </button>
        </span>
        <span class="c-name">
          <span class="name-ico" :class="`tone-${KIND_META[it.kind].tone}`">
            <BaseIcon :name="KIND_META[it.kind].icon" :size="15" />
          </span>
          <span class="name-text">
            <span class="name-title">{{ it.title }}</span>
            <span class="name-sub">{{ it.sub }}</span>
          </span>
        </span>
        <span class="c-type">
          <span class="type-badge" :class="`tone-${KIND_META[it.kind].tone}`">
            {{ KIND_META[it.kind].label.replace(/s$/, '') }}
          </span>
        </span>
        <span class="c-author">{{ it.author ?? '—' }}</span>
        <span class="c-date">{{ fmtBRDate(it.updatedAt) }}</span>
        <span class="c-actions">
          <button class="row-act" type="button" title="Restaurar" aria-label="Restaurar" @click="onRestore(it)">
            <BaseIcon name="rotate-ccw" :size="15" />
          </button>
          <button class="row-act danger" type="button" title="Excluir" aria-label="Excluir" @click="onDelete(it)">
            <BaseIcon name="trash-2" :size="15" />
          </button>
        </span>
      </div>
    </div>

    <!-- ── Grade ── -->
    <div v-else class="arq-grid">
      <div
        v-for="it in items"
        :key="keyOf(it)"
        class="gcard"
        :class="{ sel: selected.has(keyOf(it)) }"
      >
        <div class="gcard-top">
          <button
            type="button"
            class="checkbox"
            :class="{ on: selected.has(keyOf(it)) }"
            role="checkbox"
            :aria-checked="selected.has(keyOf(it))"
            :aria-label="`Selecionar ${it.title}`"
            @click="toggleSel(it)"
          >
            <BaseIcon v-if="selected.has(keyOf(it))" name="check" :size="12" />
          </button>
          <span class="type-badge" :class="`tone-${KIND_META[it.kind].tone}`">
            {{ KIND_META[it.kind].label.replace(/s$/, '') }}
          </span>
        </div>
        <span class="gcard-ico" :class="`tone-${KIND_META[it.kind].tone}`">
          <BaseIcon :name="KIND_META[it.kind].icon" :size="26" />
        </span>
        <div class="gcard-title">{{ it.title }}</div>
        <div class="gcard-sub">{{ it.sub }}</div>
        <div class="gcard-foot">
          <span class="gcard-date">{{ fmtBRDate(it.updatedAt) }}</span>
          <span class="gcard-acts">
            <button class="row-act" type="button" title="Restaurar" aria-label="Restaurar" @click="onRestore(it)">
              <BaseIcon name="rotate-ccw" :size="15" />
            </button>
            <button class="row-act danger" type="button" title="Excluir" aria-label="Excluir" @click="onDelete(it)">
              <BaseIcon name="trash-2" :size="15" />
            </button>
          </span>
        </div>
      </div>
    </div>

    <!-- ── Floating bulk toolbar ── -->
    <Transition name="bulk">
      <div v-if="selectedItems.length" class="bulk-bar" role="toolbar">
        <button class="bulk-clear" type="button" aria-label="Limpar seleção" @click="clearSel">
          <BaseIcon name="minus-circle" :size="18" />
        </button>
        <span class="bulk-count">
          {{ selectedItems.length }} selecionado{{ selectedItems.length === 1 ? '' : 's' }}
        </span>
        <span class="bulk-sep" />
        <button class="bulk-act" type="button" @click="bulkRestore">
          <BaseIcon name="rotate-ccw" :size="16" /> Restaurar
        </button>
        <button class="bulk-act danger" type="button" @click="bulkDelete">
          <BaseIcon name="trash-2" :size="16" /> Excluir
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.arq-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 26px 90px;
  max-width: 1480px;
  margin: 0 auto;
}

/* ── Header ── */
.arq-titlebar {
  display: flex;
  align-items: center;
  gap: 18px;
}
.arq-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.022em;
  color: var(--text);
  margin: 0;
}
.arq-desc {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-3);
}

/* ── Folder cards ── */
.arq-folders {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}
.folder {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  text-align: left;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: border-color var(--dur-fast) var(--ease-spring),
    transform var(--dur-fast) var(--ease-spring);
}
.folder:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
}
.folder.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), var(--shadow-card);
}
.folder-ico {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
}
.folder-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.folder-meta {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* tone helpers (shared by folder ico, name ico, badges, grid ico) */
.tone-accent .folder-ico,
.name-ico.tone-accent,
.gcard-ico.tone-accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.tone-delegate .folder-ico,
.name-ico.tone-delegate,
.gcard-ico.tone-delegate {
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.tone-project .folder-ico,
.name-ico.tone-project,
.gcard-ico.tone-project {
  background: var(--color-proj-empresa-bg);
  color: var(--color-proj-empresa-fg);
}
.tone-note .folder-ico,
.name-ico.tone-note,
.gcard-ico.tone-note {
  background: var(--pessoal-bg);
  color: var(--pessoal-fg);
}
.tone-payment .folder-ico,
.name-ico.tone-payment,
.gcard-ico.tone-payment {
  background: color-mix(in srgb, var(--color-h-micro) 14%, transparent);
  color: var(--color-h-micro);
}

/* ── Table ── */
.arq-table {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.arq-row {
  display: grid;
  grid-template-columns: 44px minmax(220px, 2fr) 120px minmax(120px, 1fr) 150px 92px;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  height: 60px;
  border-bottom: 1px solid var(--border-faint);
  transition: background var(--dur-fast) var(--ease-spring);
}
.arq-row:last-child {
  border-bottom: none;
}
.arq-row:not(.arq-row--head):hover {
  background: var(--surface-hover);
}
.arq-row.sel {
  background: var(--accent-soft);
}
.arq-row--head {
  height: 44px;
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
}
.arq-row--head span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.c-check {
  display: flex;
  align-items: center;
}
.checkbox {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1.5px solid var(--border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-fg);
  transition: background var(--dur-fast) var(--ease-spring),
    border-color var(--dur-fast) var(--ease-spring);
}
.checkbox.on {
  background: var(--accent);
  border-color: var(--accent);
}

.c-name {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.name-ico {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.name-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.name-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-sub {
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: capitalize;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
}
.type-badge.tone-delegate {
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.type-badge.tone-project {
  background: var(--color-proj-empresa-bg);
  color: var(--color-proj-empresa-fg);
}
.type-badge.tone-note {
  background: var(--pessoal-bg);
  color: var(--pessoal-fg);
}
.type-badge.tone-payment {
  background: color-mix(in srgb, var(--color-h-micro) 14%, transparent);
  color: var(--color-h-micro);
}

.c-author {
  font-size: 13px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.c-date {
  font-size: 13px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.c-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.row-act {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  transition: background var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
}
.row-act:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.row-act.danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

/* ── Grid ── */
.arq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.gcard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
.gcard.sel {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), var(--shadow-card);
}
.gcard-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.gcard-ico {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 4px 0;
}
.gcard-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gcard-sub {
  font-size: 12px;
  color: var(--text-3);
  text-transform: capitalize;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gcard-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--border-faint);
}
.gcard-date {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.gcard-acts {
  display: flex;
  gap: 2px;
}

/* ── States ── */
.arq-error {
  padding: 10px 12px;
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 12px;
}
.arq-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 70px 20px;
  color: var(--text-3);
  font-size: 13px;
}
.ae-ico {
  opacity: 0.5;
}

/* ── Bulk toolbar ── */
.bulk-bar {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 12px;
  background: var(--text);
  color: var(--accent-fg);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-lg);
}
.bulk-clear {
  display: inline-flex;
  color: rgba(255, 255, 255, 0.6);
}
.bulk-clear:hover {
  color: var(--accent-fg);
}
.bulk-count {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.bulk-sep {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.18);
  margin: 0 2px;
}
.bulk-act {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 500;
  color: var(--accent-fg);
  transition: background var(--dur-fast) var(--ease-spring);
}
.bulk-act:hover {
  background: rgba(255, 255, 255, 0.12);
}
.bulk-act.danger {
  color: #ff6961;
}
.bulk-act.danger:hover {
  background: rgba(255, 105, 97, 0.16);
}

.bulk-enter-active,
.bulk-leave-active {
  transition: transform var(--dur-medium) var(--ease-spring), opacity var(--dur-fast) ease;
}
.bulk-enter-from,
.bulk-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px);
}

@media (max-width: 1000px) {
  .arq-folders {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 760px) {
  .arq-folders {
    grid-template-columns: repeat(2, 1fr);
  }
  .arq-row {
    grid-template-columns: 40px minmax(140px, 2fr) 110px 64px;
  }
  .c-author,
  .c-date {
    display: none;
  }
}
</style>

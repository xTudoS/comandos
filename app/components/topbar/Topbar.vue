<script setup lang="ts">
const emit = defineEmits<{
  'nova-tarefa': []
}>()

const scrolled = useMainScrolled()
const { exporting, importing, exportAll, importFromFile } = useBackup()
const toast = useToast()
const route = useRoute()
const router = useRouter()

// Em /agendamentos não há ação primária no topbar — o link é único e vive num
// card da própria página. As ações de backup, ligadas a tarefas, ficam ocultas.
const isAgendamentos = computed(() => route.path.startsWith('/agendamentos'))

const fileInput = ref<HTMLInputElement>()

const SECTION_LABEL: Record<string, string> = {
  trabalho: 'Trabalho',
  agenda: 'Agenda',
  projetos: 'Projetos',
  metas: 'Metas',
  empresas: 'Empresas',
  pagamentos: 'Pagamentos',
  notas: 'Notas',
  arquivo: 'Arquivo',
  settings: 'Configurações',
  admin: 'Admin',
  quadros: 'Quadros',
}

// O último segmento de /quadros/<id> é um uuid: troca pelo nome do quadro.
const { list: boardList } = useBoards()

type Crumb = { label: string; to?: string }
const crumbs = computed<Crumb[]>(() => {
  const segs = route.path.split('/').filter(Boolean)
  if (segs.length === 0) return [{ label: 'Trabalho', to: '/trabalho' }]
  const out: Crumb[] = []
  let acc = ''
  segs.forEach((seg, i) => {
    acc += `/${seg}`
    const board = segs[0] === 'quadros' && i === 1
      ? boardList.value.find((b) => b.id === seg)
      : null
    const label =
      board?.name ?? SECTION_LABEL[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1)
    out.push({ label, to: i < segs.length - 1 ? acc : undefined })
  })
  return out
})

const canGoBack = computed(() => crumbs.value.length > 1)
function onBack() {
  if (window.history.length > 1) router.back()
  else router.push('/trabalho')
}

async function onExport() {
  try {
    await exportAll()
    toast.show('Backup exportado.')
  } catch {
    toast.show('Falha ao exportar.')
  }
}

function onImportClick() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (
    !window.confirm(
      'Importar adiciona todos os itens deste arquivo ao seu tenant (não substitui). Continuar?',
    )
  ) {
    return
  }
  const res = await importFromFile(file)
  if (res) {
    const total = Object.values(res.imported).reduce((s, n) => s + n, 0)
    toast.show(`Importado: ${total} itens.`)
    setTimeout(() => location.reload(), 600)
  } else {
    toast.show('Falha ao importar.')
  }
}
</script>

<template>
  <header class="topbar" :class="{ scrolled }">
    <!-- Left: back + breadcrumb -->
    <div class="tb-left">
      <button
        type="button"
        class="tb-back"
        :disabled="!canGoBack"
        aria-label="Voltar"
        @click="onBack"
      >
        <BaseIcon name="arrow-left" :size="18" />
      </button>
      <nav class="crumbs" aria-label="Trilha de navegação">
        <NuxtLink to="/trabalho" class="crumb home" aria-label="Início">
          <BaseIcon name="layout-grid" :size="15" />
        </NuxtLink>
        <template v-for="(c, i) in crumbs" :key="i">
          <BaseIcon name="chevron-right" :size="14" class="crumb-sep" />
          <NuxtLink v-if="c.to" :to="c.to" class="crumb">{{ c.label }}</NuxtLink>
          <span v-else class="crumb current">{{ c.label }}</span>
        </template>
      </nav>
    </div>

    <!-- Center: search -->
    <div class="tb-center">
      <TopbarBuscaGlobal />
    </div>

    <!-- Right: actions -->
    <div class="tb-right">
      <template v-if="!isAgendamentos">
        <button
          class="tb-action"
          type="button"
          :disabled="importing"
          @click="onImportClick"
        >
          <BaseIcon name="download" :size="16" />
          <span>{{ importing ? 'Importando…' : 'Importar' }}</span>
        </button>
        <button
          class="tb-action"
          type="button"
          :disabled="exporting"
          @click="onExport"
        >
          <BaseIcon name="upload" :size="16" />
          <span>{{ exporting ? 'Exportando…' : 'Exportar' }}</span>
        </button>
      </template>
      <button
        v-if="!isAgendamentos"
        class="btn primary tb-primary"
        @click="emit('nova-tarefa')"
      >
        <BaseIcon name="plus" :size="16" />
        <span>Nova tarefa</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        hidden
        @change="onFileChange"
      >
    </div>
  </header>
</template>

<style scoped>
.topbar {
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  padding: 12px 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  z-index: var(--z-sticky);
  transition: border-color var(--dur-base) var(--ease-spring);
}
.topbar.scrolled {
  border-bottom-color: var(--border-strong);
}

/* Left */
.tb-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.tb-back {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.tb-back:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.tb-back:disabled {
  opacity: 0.4;
  cursor: default;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.crumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  text-decoration: none;
  white-space: nowrap;
}
.crumb.home {
  padding: 4px 6px;
  color: var(--text-3);
}
a.crumb:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.crumb.current {
  color: var(--text);
  font-weight: 600;
  cursor: default;
}
.crumb-sep {
  color: var(--text-4);
  flex-shrink: 0;
}

/* Center */
.tb-center {
  display: flex;
  justify-content: center;
  min-width: 0;
}

/* Right */
.tb-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}
.tb-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  white-space: nowrap;
}
.tb-action:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.tb-action:disabled {
  opacity: 0.5;
  cursor: default;
}
.tb-action :deep(svg) {
  color: var(--text-3);
}
.tb-primary {
  margin-left: 4px;
  padding: 8px 14px;
}

@media (max-width: 1100px) {
  .tb-action span {
    display: none;
  }
  .tb-action {
    padding: 8px;
  }
}
@media (max-width: 880px) {
  .topbar {
    grid-template-columns: auto 1fr auto;
    padding: 10px 14px;
  }
  .crumbs {
    display: none;
  }
  .tb-primary span {
    display: none;
  }
}
</style>

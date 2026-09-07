<script setup lang="ts">
import type { SearchResult } from '~/composables/useGlobalSearch'

const { search, ensureData } = useGlobalSearch()

const q = ref('')
const open = ref(false)
const activeIndex = ref(0)
const isMac = ref(true)

const rootRef = ref<HTMLElement>()
const inputRef = ref<HTMLInputElement>()

const results = computed<SearchResult[]>(() => (q.value.trim() ? search(q.value) : []))

// Cabeçalhos de grupo: índice do primeiro item de cada grupo.
const groupStarts = computed(() => {
  const seen = new Set<string>()
  const starts = new Set<number>()
  results.value.forEach((r, i) => {
    if (!seen.has(r.group)) {
      seen.add(r.group)
      starts.add(i)
    }
  })
  return starts
})

const showPanel = computed(() => open.value && q.value.trim().length > 0)

watch(results, () => {
  activeIndex.value = 0
})

async function onFocus() {
  open.value = true
  await ensureData()
}

function onInput() {
  open.value = true
}

async function select(r: SearchResult | undefined) {
  if (!r) return
  open.value = false
  q.value = ''
  await r.run()
}

function move(delta: number) {
  if (!results.value.length) return
  const n = results.value.length
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => {
    rootRef.value
      ?.querySelector('.sr-item.active')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function onInputKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    open.value = true
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    if (showPanel.value && results.value.length) {
      e.preventDefault()
      select(results.value[activeIndex.value])
    }
  } else if (e.key === 'Escape') {
    if (q.value) {
      q.value = ''
    } else {
      open.value = false
      inputRef.value?.blur()
    }
  }
}

// Atalho global ⌘F / Ctrl+F foca a busca.
function onGlobalKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    inputRef.value?.focus()
  }
}

function onDocClick(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}

onMounted(() => {
  isMac.value = /Mac|iPhone|iPad/.test(navigator.platform)
  window.addEventListener('keydown', onGlobalKey)
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKey)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div ref="rootRef" class="search-root">
    <div class="search">
      <BaseIcon name="search" :size="16" class="search-ic" />
      <input
        ref="inputRef"
        v-model="q"
        type="search"
        placeholder="Buscar tarefas, projetos, empresas…"
        aria-label="Buscar"
        role="combobox"
        :aria-expanded="showPanel"
        aria-controls="search-results"
        autocomplete="off"
        @focus="onFocus"
        @input="onInput"
        @keydown="onInputKey"
      >
      <kbd class="search-kbd">{{ isMac ? '⌘F' : 'Ctrl F' }}</kbd>
    </div>

    <div v-if="showPanel" id="search-results" class="search-panel" role="listbox">
      <template v-if="results.length">
        <template v-for="(r, i) in results" :key="r.type + r.id">
          <div v-if="groupStarts.has(i)" class="sr-group">{{ r.group }}</div>
          <button
            type="button"
            class="sr-item"
            :class="{ active: i === activeIndex }"
            role="option"
            :aria-selected="i === activeIndex"
            @mouseenter="activeIndex = i"
            @click="select(r)"
          >
            <BaseIcon :name="r.icon" :size="15" class="sr-ic" />
            <span class="sr-text">
              <span class="sr-title">{{ r.title }}</span>
              <span v-if="r.subtitle" class="sr-sub">{{ r.subtitle }}</span>
            </span>
            <BaseIcon name="corner-down-left" :size="13" class="sr-enter" />
          </button>
        </template>
      </template>
      <div v-else class="sr-empty">
        Nenhum resultado para “{{ q.trim() }}”.
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-root {
  position: relative;
  width: 100%;
  min-width: 220px;
  max-width: 460px;
}
.search {
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
}
.search-ic {
  position: absolute;
  left: 12px;
  color: var(--text-3);
  pointer-events: none;
}
.search input {
  width: 100%;
  padding: 8px 52px 8px 36px;
  font-size: 13px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  transition:
    border-color var(--dur-fast) var(--ease-spring),
    box-shadow var(--dur-fast) var(--ease-spring),
    background var(--dur-fast) var(--ease-spring);
}
.search input::placeholder {
  color: var(--text-3);
}
.search input:focus {
  outline: none;
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}
.search-kbd {
  position: absolute;
  right: 8px;
  font-family: var(--font);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}

/* ── Results panel ── */
.search-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 60vh;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
  padding: 6px;
  z-index: var(--z-pop);
}
.sr-group {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-4);
  padding: 8px 8px 4px;
}
.sr-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  color: var(--text);
}
.sr-item.active {
  background: var(--surface-hover);
}
.sr-ic {
  color: var(--text-3);
  flex-shrink: 0;
}
.sr-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.sr-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sr-sub {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sr-enter {
  color: var(--text-4);
  opacity: 0;
  flex-shrink: 0;
}
.sr-item.active .sr-enter {
  opacity: 1;
}
.sr-empty {
  padding: 16px 10px;
  font-size: 13px;
  color: var(--text-3);
  text-align: center;
}
</style>

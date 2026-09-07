<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Company } from '~/composables/useCompanies'

interface Props {
  /** Id da empresa selecionada (null = nenhuma). */
  modelValue: string | null
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Buscar ou criar empresa…',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [string | null]
}>()

const { list, refresh, create, byId } = useCompanies()

onMounted(() => {
  if (list.value.length === 0) void refresh()
})

const query = ref('')
const open = ref(false)
const activeIndex = ref(0)
const creating = ref(false)
const rootEl = ref<HTMLElement>()

// Sincroniza o input com o id selecionado externamente.
watch(
  () => props.modelValue,
  (id) => {
    if (!id) {
      if (!creating.value) query.value = ''
      return
    }
    const c = byId(id)
    if (c && c.name !== query.value) query.value = c.name
  },
  { immediate: true },
)

watch(list, () => {
  if (props.modelValue) {
    const c = byId(props.modelValue)
    if (c && c.name !== query.value) query.value = c.name
  }
})

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  const filtered = list.value.filter((c) => {
    if (c.archived) return false
    return !q || c.name.toLowerCase().includes(q)
  })
  return filtered.slice(0, 10)
})

const canCreate = computed(() => {
  const q = query.value.trim()
  if (!q) return false
  return !visible.value.some((c) => c.name.toLowerCase() === q.toLowerCase())
})

type Option =
  | { kind: 'company'; company: Company }
  | { kind: 'create'; name: string }
  | { kind: 'clear' }

const options = computed<Option[]>(() => {
  const opts: Option[] = []
  if (props.modelValue || query.value.trim()) opts.push({ kind: 'clear' })
  for (const c of visible.value) opts.push({ kind: 'company', company: c })
  if (canCreate.value) opts.push({ kind: 'create', name: query.value.trim() })
  return opts
})

watch(options, () => {
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, options.value.length - 1))
})

function onInput() {
  open.value = true
  activeIndex.value = 0
  // Typing forgets the previously picked id — parent re-syncs on pick.
  if (props.modelValue) emit('update:modelValue', null)
}

async function pick(opt: Option) {
  if (opt.kind === 'clear') {
    emit('update:modelValue', null)
    query.value = ''
    open.value = false
    return
  }
  if (opt.kind === 'company') {
    emit('update:modelValue', opt.company.id)
    query.value = opt.company.name
    open.value = false
    return
  }
  // create — get-or-create idempotente no backend
  creating.value = true
  try {
    const row = await create(opt.name)
    emit('update:modelValue', row.id)
    query.value = row.name
    open.value = false
  } finally {
    creating.value = false
  }
}

function onFocus() {
  open.value = true
}
function onBlur() {
  setTimeout(() => {
    open.value = false
  }, 120)
}
function onKey(e: KeyboardEvent) {
  if (!open.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    open.value = true
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, options.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    const opt = options.value[activeIndex.value]
    if (!opt) return
    e.preventDefault()
    void pick(opt)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}
</script>

<template>
  <div ref="rootEl" class="company-autocomplete">
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder"
      :disabled="disabled || creating"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKey"
    />
    <ul v-if="open && options.length > 0" class="menu">
      <li
        v-for="(opt, i) in options"
        :key="
          opt.kind === 'company'
            ? `c-${opt.company.id}`
            : opt.kind === 'create'
              ? 'create'
              : 'clear'
        "
        class="row"
        :class="{
          active: i === activeIndex,
          create: opt.kind === 'create',
          clear: opt.kind === 'clear',
        }"
        @mousedown.prevent="pick(opt)"
      >
        <template v-if="opt.kind === 'company'">
          <BaseIcon name="building-2" :size="14" class="row-ico" />
          <span class="name">{{ opt.company.name }}</span>
        </template>
        <template v-else-if="opt.kind === 'create'">
          <BaseIcon name="plus" :size="14" class="row-ico" />
          <span class="name create-label">
            criar nova: <strong>"{{ opt.name }}"</strong>
          </span>
        </template>
        <template v-else>
          <BaseIcon name="x" :size="14" class="row-ico" />
          <span class="name clear-label">— remover empresa —</span>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.company-autocomplete {
  position: relative;
}
.menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
  z-index: 30;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 280px;
  overflow-y: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}
.row.active {
  background: var(--surface-hover);
}
.row .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row .row-ico {
  flex-shrink: 0;
  color: var(--text-3);
}
.row.create .create-label {
  color: var(--accent);
}
.row.clear .clear-label {
  color: var(--text-3);
  font-style: italic;
}
</style>

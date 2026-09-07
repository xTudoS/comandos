<script setup lang="ts">
import type { Person } from '~/composables/usePeople'

const props = defineProps<{
  modelValue: string | null
  name: string
  /** Email digitado quando usuário escolhe 'criar com email'. Em sync com parent. */
  email?: string | null
  placeholder?: string
  excludeAssistant?: boolean
  onlyAssistants?: boolean
  /** Modo "adicionar": ao escolher, emite `select` e limpa o campo (para listas). */
  multiple?: boolean
  /** Ids de pessoas já escolhidas — omitidas da lista em modo `multiple`. */
  excludeIds?: string[]
}>()
const emit = defineEmits<{
  'update:modelValue': [string | null]
  'update:name': [string]
  'update:email': [string | null]
  /** Emitido em modo `multiple` a cada pessoa adicionada. */
  select: [{ personId: string | null; name: string; email: string | null }]
}>()

const { list, refresh } = usePeople()

onMounted(() => {
  if (list.value.length === 0) void refresh()
})

const query = ref(props.name ?? '')

// Mantém o input em sincronia com o parent. Quando o usuário cria "com email"
// o name volta vazio mas o email é preenchido — nesse caso mostramos o email
// no campo em vez de limpá-lo (senão parece que nada aconteceu).
watch(
  [() => props.name, () => props.email],
  ([n, e]) => {
    const desired = n || e || ''
    if (desired !== query.value) query.value = desired
  },
  { immediate: true }
)
watch(
  [() => props.modelValue, list],
  ([id, lst]) => {
    if (!id) return
    const match = lst.find((p) => p.id === id)
    if (match && match.name !== query.value) query.value = match.name
  },
  { immediate: true }
)

const rootEl = ref<HTMLElement>()
const open = ref(false)
const activeIndex = ref(0)

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

const queryIsEmail = computed(() => isEmail(query.value))

const visiblePeople = computed(() => {
  const q = query.value.trim().toLowerCase()
  const filtered = list.value.filter((p) => {
    if (p.archived) return false
    if (props.excludeAssistant && p.isAssistant) return false
    if (props.onlyAssistants && !p.isAssistant) return false
    if (props.multiple && props.excludeIds?.includes(p.id)) return false
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q)
    )
  })
  return filtered.slice(0, 8)
})

const canCreate = computed(() => {
  if (props.onlyAssistants) return false // Assistentes não são criados por aqui
  const q = query.value.trim()
  if (!q) return false
  return !visiblePeople.value.some(
    (p) =>
      p.name.toLowerCase() === q.toLowerCase() ||
      (p.email ?? '').toLowerCase() === q.toLowerCase(),
  )
})

type Option =
  | { kind: 'person'; person: Person }
  | { kind: 'create'; text: string; email: boolean }

const options = computed<Option[]>(() => {
  const opts: Option[] = visiblePeople.value.map((p) => ({ kind: 'person', person: p }))
  if (canCreate.value) {
    opts.push({
      kind: 'create',
      text: query.value.trim(),
      email: queryIsEmail.value,
    })
  }
  return opts
})

watch(options, () => {
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, options.value.length - 1))
})

function onInput() {
  open.value = true
  activeIndex.value = 0
  // Typing forgets the previously picked person — the parent will re-select
  // if the text matches an existing record on blur / pick.
  if (props.modelValue) emit('update:modelValue', null)
  emit('update:name', query.value)
  emit('update:email', null)
}

function pickPerson(p: Person) {
  if (props.multiple) {
    emit('select', { personId: p.id, name: p.name, email: p.email ?? null })
    query.value = ''
    open.value = false
    return
  }
  emit('update:modelValue', p.id)
  emit('update:name', p.name)
  emit('update:email', p.email ?? null)
  query.value = p.name
  open.value = false
}

function pickCreate(opt: { text: string; email: boolean }) {
  if (props.multiple) {
    emit('select', {
      personId: null,
      name: opt.email ? '' : opt.text,
      email: opt.email ? opt.text : null,
    })
    query.value = ''
    open.value = false
    return
  }
  emit('update:modelValue', null)
  if (opt.email) {
    // Email-mode: send email separately so backend can save and use the
    // local-part as the display name.
    emit('update:name', '')
    emit('update:email', opt.text)
  } else {
    emit('update:name', opt.text)
    emit('update:email', null)
  }
  query.value = opt.text
  open.value = false
}

function onFocus() {
  open.value = true
}
function onBlur() {
  // Delay so a mousedown on a dropdown row lands first.
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
    if (opt.kind === 'person') pickPerson(opt.person)
    else pickCreate({ text: opt.text, email: opt.email })
  } else if (e.key === 'Escape') {
    open.value = false
  }
}
</script>

<template>
  <div ref="rootEl" class="pessoa-autocomplete">
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder ?? 'Nome ou email…'"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKey"
    />
    <ul v-if="open && options.length > 0" class="menu">
      <li
        v-for="(opt, i) in options"
        :key="opt.kind === 'person' ? opt.person.id : 'create'"
        class="row"
        :class="{ active: i === activeIndex, create: opt.kind === 'create' }"
        @mousedown.prevent="opt.kind === 'person' ? pickPerson(opt.person) : pickCreate({ text: opt.text, email: opt.email })"
      >
        <template v-if="opt.kind === 'person'">
          <span class="name">{{ opt.person.name }}</span>
          <span v-if="opt.person.email" class="email">{{ opt.person.email }}</span>
          <span v-if="!opt.person.linkedUserId" class="pending">sem conta</span>
          <span v-else-if="opt.person.isAssistant" class="pending">assistente</span>
        </template>
        <template v-else>
          <span class="name create-label">
            <template v-if="opt.email">+ adicionar com email: <strong>{{ opt.text }}</strong></template>
            <template v-else>+ criar nova: "{{ opt.text }}"</template>
          </span>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pessoa-autocomplete {
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
  max-height: 240px;
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
.row .email {
  font-size: 11px;
  color: var(--text-3);
}
.row .pending {
  font-size: 10px;
  color: var(--text-3);
  padding: 2px 6px;
  background: var(--surface-alt);
  border-radius: 10px;
}
.row.create .create-label {
  color: var(--accent);
  font-weight: 500;
}
</style>

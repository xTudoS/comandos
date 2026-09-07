<script setup lang="ts">
const props = defineProps<{ taskId: string | null }>()
const taskIdRef = computed(() => props.taskId)
const { items, loading, error, add, toggle, rename, remove, flush } = useChecklist(taskIdRef)

// Exposto para o TaskModal: persiste os itens bufferados (adicionados antes de a
// tarefa existir) assim que a tarefa é criada.
defineExpose({ flush })

const newText = ref('')
async function onAdd() {
  const t = newText.value.trim()
  if (!t) return
  newText.value = ''
  try {
    await add(t)
  } catch {
    // Se der erro, devolve o texto para o usuário não perder
    newText.value = t
  }
}

function onPaste(e: ClipboardEvent) {
  const paste = e.clipboardData?.getData('text')
  if (!paste) return
  if (paste.includes('\n')) {
    e.preventDefault()
    const lines = paste.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    // Dispara todos em paralelo para não travar a UI
    for (const line of lines) {
      void add(line)
    }
  }
}

const editingId = ref<string | null>(null)
const editingText = ref('')
function startEdit(id: string, current: string) {
  editingId.value = id
  editingText.value = current
}
function commitEdit() {
  if (!editingId.value) return
  const t = editingText.value.trim()
  if (t) void rename(editingId.value, t)
  editingId.value = null
}
function cancelEdit() {
  editingId.value = null
}
</script>

<template>
  <div class="checklist">
    <div v-if="loading && items.length === 0" class="state">Carregando…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="state empty">Sem itens.</div>

    <ul v-else class="items">
      <li v-for="i in items" :key="i.id" class="item">
        <AppCircleCheck
          :model-value="i.done"
          variant="success"
          size="sm"
          :aria-label="`Marcar ${i.text} como ${i.done ? 'pendente' : 'feito'}`"
          @update:model-value="(v) => toggle(i.id, v === true)"
        />
        <template v-if="editingId === i.id">
          <input
            v-model="editingText"
            type="text"
            class="grow item-input"
            autofocus
            @keydown.enter="commitEdit"
            @keydown.escape="cancelEdit"
            @blur="commitEdit"
          />
        </template>
        <template v-else>
          <span
            class="text"
            :class="{ done: i.done }"
            @click="startEdit(i.id, i.text)"
          >
            {{ i.text }}
          </span>
        </template>
        <button
          class="row-action"
          type="button"
          :aria-label="`Remover item: ${i.text}`"
          @click="remove(i.id)"
        >
          <BaseIcon name="x" :size="12" />
        </button>
      </li>
    </ul>

    <div class="add">
      <input
        v-model="newText"
        type="text"
        placeholder="Adicionar item… (Enter)"
        class="grow"
        @keydown.enter="onAdd"
        @paste="onPaste"
      />
      <button class="btn primary" :disabled="!newText.trim()" @click="onAdd">+</button>
    </div>
  </div>
</template>

<style scoped>
.checklist {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px;
}
.item .text {
  flex: 1;
  font-size: 13px;
  cursor: text;
}
.item .text.done {
  text-decoration: line-through;
  color: var(--text-3);
}
.add {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed var(--border);
}
.grow {
  flex: 1;
}
.item-input {
  font-size: 13px;
  padding: 4px 8px;
}
.row-action {
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  border-radius: 6px;
  font-size: 13px;
  flex-shrink: 0;
}
.row-action:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.state {
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  padding: 8px;
  font-style: italic;
}
.state.error {
  color: var(--danger);
}
</style>

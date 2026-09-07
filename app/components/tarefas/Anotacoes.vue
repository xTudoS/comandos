<script setup lang="ts">
const props = defineProps<{ taskId: string }>()
const taskIdRef = computed(() => props.taskId)
const { list, loading, error, add, remove } = useAnnotations(taskIdRef)

const draft = ref('')
async function onAdd() {
  const t = draft.value.trim()
  if (!t) return
  await add(t)
  draft.value = ''
}

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="anotacoes">
    <div v-if="loading && list.length === 0" class="state">Carregando…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="list.length === 0" class="state empty">Sem anotações.</div>

    <ul v-else class="items">
      <li v-for="a in list" :key="a.id" class="item">
        <div class="meta">
          <span class="author">{{ a.authorName ?? 'Alguém' }}</span>
          <span class="when">{{ fmtWhen(a.createdAt) }}</span>
          <button
            class="row-action"
            type="button"
            aria-label="Remover anotação"
            @click="remove(a.id)"
          >
            <BaseIcon name="x" :size="12" />
          </button>
        </div>
        <p class="body">{{ a.body }}</p>
      </li>
    </ul>

    <div class="add">
      <textarea
        v-model="draft"
        rows="3"
        placeholder="Nova anotação…"
      />
      <div class="add-actions">
        <button class="btn primary" :disabled="!draft.trim()" @click="onAdd">
          Adicionar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.anotacoes {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}
.item {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.meta .author {
  font-weight: 600;
  color: var(--text-2);
}
.meta .when {
  font-variant-numeric: tabular-nums;
}
.meta > :last-child {
  margin-left: auto;
}
.body {
  font-size: 13px;
  white-space: pre-wrap;
  line-height: 1.4;
}
.add {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
}
.add-actions {
  display: flex;
  justify-content: flex-end;
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
.row-action {
  width: 22px;
  height: 22px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  border-radius: 4px;
  font-size: 11px;
}
.row-action:hover {
  background: var(--surface-hover);
  color: var(--text);
}
</style>

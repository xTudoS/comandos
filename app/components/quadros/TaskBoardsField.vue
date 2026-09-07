<script setup lang="ts">
// Campo "Quadros" do TaskModal: em quais quadros esta tarefa está.
//
// Marcar coloca o card no fim da primeira coluna do quadro; desmarcar tira o
// card. Num quadro compartilhado, marcar É compartilhar a tarefa — daí o aviso.
import { useToast } from '~/composables/useToast'

const props = defineProps<{ taskId: string }>()

const { active: boards, refresh: refreshBoards } = useBoards()
const { show: toast } = useToast()

const boardIds = ref<string[]>([])
const loading = ref(false)
const busy = ref<string | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([
      refreshBoards(),
      $fetch<{ boardIds: string[] }>(`/api/tasks/${props.taskId}/boards`).then((r) => {
        boardIds.value = r.boardIds
      }),
    ])
  } catch {
    // Sem os quadros o campo fica vazio; o resto do modal segue funcionando.
  } finally {
    loading.value = false
  }
})

function isIn(boardId: string) {
  return boardIds.value.includes(boardId)
}

async function toggle(boardId: string, shared: boolean) {
  if (busy.value) return
  busy.value = boardId
  const wasIn = isIn(boardId)
  // Otimista: a marcação responde na hora e é revertida se o servidor recusar.
  boardIds.value = wasIn
    ? boardIds.value.filter((id) => id !== boardId)
    : [...boardIds.value, boardId]
  try {
    if (wasIn) {
      await $fetch(`/api/boards/${boardId}/cards/${props.taskId}`, { method: 'DELETE' })
    } else {
      await $fetch(`/api/boards/${boardId}/cards`, {
        method: 'POST',
        body: { taskId: props.taskId },
      })
      if (shared) toast('Quadro compartilhado — os membros passam a enxergar esta tarefa.', 3600)
    }
    // Atualiza os chips de quadro no card da tarefa.
    await useTasks().refresh()
  } catch {
    boardIds.value = wasIn
      ? [...boardIds.value, boardId]
      : boardIds.value.filter((id) => id !== boardId)
    toast('Não foi possível atualizar os quadros.')
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="tbf">
    <p v-if="loading" class="tbf-state">Carregando quadros…</p>
    <p v-else-if="!boards.length" class="tbf-state">
      Você ainda não tem quadros. Crie um em <NuxtLink to="/quadros">Quadros</NuxtLink>.
    </p>
    <ul v-else class="tbf-list">
      <li v-for="b in boards" :key="b.id">
        <button
          type="button"
          class="tbf-item"
          :class="{ on: isIn(b.id) }"
          :aria-pressed="isIn(b.id)"
          :disabled="busy === b.id"
          @click="toggle(b.id, b.memberCount > 0)"
        >
          <BaseIcon :name="isIn(b.id) ? 'check' : 'plus'" :size="13" />
          <BaseIcon :name="b.icon" :size="14" class="tbf-ic" />
          <span class="tbf-name">{{ b.name }}</span>
          <span v-if="b.memberCount" class="tbf-shared" title="Quadro compartilhado">
            <BaseIcon name="users" :size="11" />
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tbf-state {
  font-size: 12px;
  color: var(--text-4);
}
.tbf-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tbf-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-3);
}
.tbf-item:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.tbf-item:disabled {
  opacity: 0.5;
}
.tbf-item.on {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.tbf-ic {
  color: currentColor;
  opacity: 0.7;
}
.tbf-shared {
  display: inline-flex;
  opacity: 0.75;
}
</style>

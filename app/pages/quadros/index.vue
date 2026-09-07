<script setup lang="ts">
// /quadros — listagem e criação. A navegação do dia a dia é pelo grupo
// "Quadros" da sidebar; esta página existe para criar quadros e, principalmente,
// para recuperar os arquivados, que não aparecem na sidebar.

import { useToast } from '~/composables/useToast'

const { list, active, archived, loading, refresh, create, update } = useBoards()
const { show: toast } = useToast()
const router = useRouter()

loading.value = true
onMounted(() => {
  refresh().catch(() => {})
})

const creating = ref(false)
const newName = ref('')
const newNameInput = ref<HTMLInputElement>()

async function startCreate() {
  creating.value = true
  newName.value = ''
  await nextTick()
  newNameInput.value?.focus()
}

async function commitCreate() {
  const name = newName.value.trim()
  creating.value = false
  if (!name) return
  try {
    const board = await create({ name })
    await router.push(`/quadros/${board.id}`)
  } catch {
    toast('Não foi possível criar o quadro.')
  }
}

async function unarchive(id: string) {
  try {
    await update(id, { archived: false })
  } catch {
    toast('Não foi possível desarquivar.')
  }
}
</script>

<template>
  <div class="quadros-wrap">
    <PageHeader
      title="Quadros"
      desc="Suas visões próprias: colunas que você define e tarefas que você coloca. Uma tarefa pode estar em vários quadros."
    >
      <template #actions>
        <button type="button" class="qs-new" @click="startCreate">
          <BaseIcon name="plus" :size="15" />
          Novo quadro
        </button>
      </template>
    </PageHeader>

    <div v-if="creating" class="qs-create">
      <input
        ref="newNameInput"
        v-model="newName"
        class="qs-create-input"
        type="text"
        placeholder="Nome do quadro"
        @blur="commitCreate"
        @keydown.enter.prevent="commitCreate"
        @keydown.esc="creating = false"
      >
    </div>

    <p v-if="loading && !list.length" class="qs-state">Carregando…</p>

    <template v-else>
      <ul v-if="active.length" class="qs-grid">
        <li v-for="b in active" :key="b.id">
          <NuxtLink :to="`/quadros/${b.id}`" class="qs-card">
            <span class="qs-card-top">
              <BaseIcon :name="b.icon" :size="18" class="qs-card-ic" />
              <span v-if="b.memberCount" class="qs-card-shared" title="Compartilhado">
                <BaseIcon name="users" :size="12" />
                {{ b.memberCount }}
              </span>
            </span>
            <span class="qs-card-name">{{ b.name }}</span>
            <span class="qs-card-meta">
              {{ b.cardCount }} {{ b.cardCount === 1 ? 'tarefa' : 'tarefas' }}
              <template v-if="!b.isOwner"> · de outra pessoa</template>
            </span>
          </NuxtLink>
        </li>
      </ul>
      <BaseEmptyState
        v-else
        titulo="Nenhum quadro ainda"
        descricao="Crie um quadro para agrupar tarefas do seu jeito — por cliente, por frente de trabalho, pelo que fizer sentido."
      />

      <section v-if="archived.length" class="qs-arch">
        <h2 class="qs-arch-title">Arquivados</h2>
        <ul class="qs-arch-list">
          <li v-for="b in archived" :key="b.id" class="qs-arch-item">
            <span>{{ b.name }}</span>
            <button type="button" class="qs-arch-btn" @click="unarchive(b.id)">
              Desarquivar
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.quadros-wrap {
  padding: 20px 24px 32px;
}
.qs-new {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
}
.qs-create {
  margin-bottom: 16px;
}
.qs-create-input {
  width: 320px;
  max-width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
}
.qs-state {
  font-size: 13px;
  color: var(--text-4);
}
.qs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}
.qs-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  height: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  transition: border-color 120ms ease, background 120ms ease;
}
.qs-card:hover {
  border-color: var(--accent);
  background: var(--surface-hover);
}
.qs-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.qs-card-ic {
  color: var(--text-3);
}
.qs-card-shared {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent);
}
.qs-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.qs-card-meta {
  font-size: 12px;
  color: var(--text-4);
}
.qs-arch {
  margin-top: 28px;
}
.qs-arch-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: 8px;
}
.qs-arch-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.qs-arch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-3);
}
.qs-arch-item:hover {
  background: var(--surface-hover);
}
.qs-arch-btn {
  font-size: 12px;
  color: var(--accent);
}
</style>

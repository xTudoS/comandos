<script setup lang="ts">
import { computed, ref, watch } from 'vue'
export type CascadeAction = 'archive' | 'delete'
export type CascadeChildren = {
  projects: Array<{ id: string; name: string; archived: boolean }>
  tasks: Array<{ id: string; title: string; archived: boolean; done: boolean }>
}

interface Props {
  open: boolean
  action: CascadeAction
  metaTitulo: string
  children: CascadeChildren
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [payload: { projectIds: string[]; taskIds: string[] }]
}>()

const selectedProjects = ref<Set<string>>(new Set())
const selectedTasks = ref<Set<string>>(new Set())
const submitting = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      submitting.value = false
      return
    }
    // Default: nothing selected — just unlink everything by default. The user
    // explicitly opts into cascading by checking each item.
    selectedProjects.value = new Set()
    selectedTasks.value = new Set()
  },
  { immediate: true },
)

const titulo = computed(() =>
  props.action === 'archive' ? 'Arquivar meta' : 'Apagar meta',
)
const verb = computed(() => (props.action === 'archive' ? 'Arquivar' : 'Apagar'))
const verbLower = computed(() => (props.action === 'archive' ? 'arquivar' : 'apagar'))

const totalProjects = computed(() => props.children.projects.length)
const totalTasks = computed(() => props.children.tasks.length)
const totalChildren = computed(() => totalProjects.value + totalTasks.value)

function toggleProject(id: string) {
  if (selectedProjects.value.has(id)) selectedProjects.value.delete(id)
  else selectedProjects.value.add(id)
  selectedProjects.value = new Set(selectedProjects.value)
}
function toggleTask(id: string) {
  if (selectedTasks.value.has(id)) selectedTasks.value.delete(id)
  else selectedTasks.value.add(id)
  selectedTasks.value = new Set(selectedTasks.value)
}
function selectAllProjects(v: boolean) {
  selectedProjects.value = v
    ? new Set(props.children.projects.map((p) => p.id))
    : new Set()
}
function selectAllTasks(v: boolean) {
  selectedTasks.value = v
    ? new Set(props.children.tasks.map((t) => t.id))
    : new Set()
}

const allProjectsSelected = computed(
  () =>
    totalProjects.value > 0 &&
    selectedProjects.value.size === totalProjects.value,
)
const allTasksSelected = computed(
  () => totalTasks.value > 0 && selectedTasks.value.size === totalTasks.value,
)

const summary = computed(() => {
  const sp = selectedProjects.value.size
  const st = selectedTasks.value.size
  const cascadeCount = sp + st
  const unlinkCount = totalChildren.value - cascadeCount
  if (totalChildren.value === 0) {
    return `${verb.value} esta meta. Sem itens vinculados.`
  }
  const parts: string[] = []
  if (cascadeCount > 0) {
    parts.push(`${verbLower.value} ${cascadeCount} item${cascadeCount === 1 ? '' : 's'}`)
  }
  if (unlinkCount > 0) {
    parts.push(`desvincular ${unlinkCount} item${unlinkCount === 1 ? '' : 's'}`)
  }
  return parts.length > 0
    ? `${verb.value} a meta e ${parts.join(' e ')}.`
    : `${verb.value} a meta.`
})

function close() {
  if (submitting.value) return
  emit('update:open', false)
}

function onConfirm() {
  if (submitting.value) return
  submitting.value = true
  emit('confirm', {
    projectIds: Array.from(selectedProjects.value),
    taskIds: Array.from(selectedTasks.value),
  })
}

defineExpose({
  setSubmitting: (v: boolean) => (submitting.value = v),
})
</script>

<template>
  <AppModal
    :open="open"
    :titulo="titulo"
    :max-width="560"
    :close-on-backdrop="!submitting"
    @update:open="(v) => !v && close()"
  >
    <p class="cascade-intro">
      Você está prestes a {{ verbLower }} <strong>"{{ metaTitulo }}"</strong>.
      <span v-if="totalChildren > 0">
        Marque o que deve ser {{ verbLower }} junto. Itens não marcados serão
        <strong>desvinculados</strong> da meta (mas continuam existindo).
      </span>
    </p>

    <div v-if="loading" class="state">Carregando vinculados…</div>

    <template v-else>
      <section v-if="totalProjects > 0" class="cascade-section">
        <header class="cascade-section-head">
          <span class="cascade-section-h">
            Projetos vinculados ({{ totalProjects }})
          </span>
          <button
            type="button"
            class="select-all"
            @click="selectAllProjects(!allProjectsSelected)"
          >
            {{ allProjectsSelected ? 'Desmarcar todos' : 'Marcar todos' }}
          </button>
        </header>
        <ul class="cascade-list">
          <li v-for="p in children.projects" :key="p.id" class="cascade-item">
            <BaseCheckbox
              :model-value="selectedProjects.has(p.id)"
              @update:model-value="toggleProject(p.id)"
            />
            <div class="ci-text">
              <span class="ci-name">{{ p.name }}</span>
              <span v-if="p.archived" class="ci-tag">Arquivado</span>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="totalTasks > 0" class="cascade-section">
        <header class="cascade-section-head">
          <span class="cascade-section-h">
            Tarefas diretas ({{ totalTasks }})
          </span>
          <button
            type="button"
            class="select-all"
            @click="selectAllTasks(!allTasksSelected)"
          >
            {{ allTasksSelected ? 'Desmarcar todas' : 'Marcar todas' }}
          </button>
        </header>
        <ul class="cascade-list">
          <li v-for="t in children.tasks" :key="t.id" class="cascade-item">
            <BaseCheckbox
              :model-value="selectedTasks.has(t.id)"
              @update:model-value="toggleTask(t.id)"
            />
            <div class="ci-text">
              <span class="ci-name" :class="{ done: t.done }">{{ t.title }}</span>
              <span v-if="t.done" class="ci-tag">Concluída</span>
              <span v-if="t.archived" class="ci-tag">Arquivada</span>
            </div>
          </li>
        </ul>
      </section>

      <p v-if="totalChildren === 0" class="state empty">
        Nenhum projeto ou tarefa vinculado a esta meta.
      </p>

      <p class="cascade-summary">{{ summary }}</p>
    </template>

    <template #actions>
      <BaseButton variant="ghost" :disabled="submitting" @click="close">
        Cancelar
      </BaseButton>
      <BaseButton
        :variant="action === 'delete' ? 'danger' : 'warning'"
        :loading="submitting"
        @click="onConfirm"
      >
        {{ verb }}
      </BaseButton>
    </template>
  </AppModal>
</template>

<style scoped>
.cascade-intro {
  margin: 0 0 14px;
  font-size: var(--fs-13);
  color: var(--color-text);
  line-height: var(--lh-base);
}
.state {
  font-size: var(--fs-13);
  color: var(--color-text-3);
  text-align: center;
  padding: 16px;
}
.state.empty {
  font-style: italic;
}
.cascade-section + .cascade-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}
.cascade-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.cascade-section-h {
  font-size: var(--fs-11);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-3);
}
.select-all {
  background: transparent;
  border: 0;
  font-family: inherit;
  font-size: var(--fs-12);
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
}
.select-all:hover {
  text-decoration: underline;
}
.cascade-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}
.cascade-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.1s;
}
.cascade-item:hover {
  background: var(--color-surface-hover);
}
.ci-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.ci-name {
  font-size: var(--fs-13);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ci-name.done {
  text-decoration: line-through;
  color: var(--color-text-3);
}
.ci-tag {
  font-size: var(--fs-10);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-3);
  background: var(--color-surface-alt);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
}
.cascade-summary {
  margin: 14px 0 0;
  font-size: var(--fs-12);
  color: var(--color-text-2);
  background: var(--color-surface-alt);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  line-height: var(--lh-base);
}
</style>

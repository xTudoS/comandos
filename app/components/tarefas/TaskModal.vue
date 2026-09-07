<script setup lang="ts">
import type { ActionItem } from '#ui/types'
import type { Task, CreateTaskInput, UpdateTaskPatch } from '~/composables/useTasks'
import type { HorizonDb } from '~/utils/horizontes'
import type { SuggestionFields } from '~/composables/useTaskSuggestion'
import { AREA_META, type LifeAreaKey } from '~/composables/useLifeTracker'
import CompanyAutocomplete from '~/components/empresas/CompanyAutocomplete.vue'
import { useMetasStore } from '~/stores/metas'

const { state, close } = useTaskModal()
const { list: taskList, create, update, reassign, archive, remove, complete } = useTasks()
const { list: projectList, refresh: refreshProjects, create: createProject } = useProjects()
const metasStore = useMetasStore()
const { ask } = useConfirm()
const {
  state: lifeState,
  ensureLoaded: ensureLifeLoaded,
  addItem: addLifeItem,
} = useLifeTracker()

const isOpen = computed({
  get: () => state.value.open,
  set: (v) => {
    if (!v) close()
  },
})

type Tab = 'detalhes' | 'checklist' | 'anotacoes' | 'anexos' | 'historico'
const active = ref<Tab>('detalhes')

// Ref ao componente de checklist (expõe flush) e contador que remonta o checklist
// a cada abertura do modal — assim o buffer local de criação não vaza entre abas/tarefas.
const checklistRef = ref<{ flush: (taskId: string) => Promise<void> } | null>(null)
const formSession = ref(0)

type FormState = {
  title: string
  description: string
  horizon: HorizonDb
  isMicro: boolean
  type: Task['type']
  delegatePersonId: string | null
  delegateName: string
  delegateEmail: string | null
  /** Encoded vínculo: '' = solto, 'p:<id>' = projeto, 'g:<id>' = meta. */
  vinculo: string
  companyId: string | null
  scheduledDate: string
  scheduledTime: string
  durationMinutes: number | null
  followupActive: boolean
  followupDate: string
  followupDescription: string
  lifeArea: LifeAreaKey | null
  lifeItemId: string | null
  /** Convidados: pessoas existentes (personId) ou novas a criar (name/email). */
  participants: { personId: string | null; name: string; email: string | null }[]
}

const defaults: FormState = {
  title: '',
  description: '',
  horizon: 'core30',
  isMicro: false,
  type: 'ceo',
  delegatePersonId: null,
  delegateName: '',
  delegateEmail: null,
  vinculo: '',
  companyId: null,
  scheduledDate: '',
  scheduledTime: '',
  durationMinutes: null,
  followupActive: false,
  followupDate: '',
  followupDescription: '',
  lifeArea: null,
  lifeItemId: null,
  participants: [],
}

const form = reactive<FormState>({ ...defaults })

// ── Sugestão da IA ──────────────────────────────────────────────────────────
// Ação EXPLÍCITA do usuário, nunca automática. Duas razões:
//  1. o offline-first — a criação da tarefa não pode depender de rede, e uma
//     classificação disparada sozinha no save empurraria o app nessa direção;
//  2. sugerir-e-confirmar — preencher campo errado sozinho é pior que deixar
//     vazio, então nada muda no formulário até alguém clicar em "Aplicar".
const sug = useTaskSuggestion()

async function onSuggest() {
  const id = currentTaskId.value
  if (id) await sug.classify(id)
}

/** Aplica só o que a sugestão trouxe; o resto do formulário fica intacto. */
function applySuggestion(f: SuggestionFields) {
  if (f.horizon) form.horizon = f.horizon as HorizonDb
  if (f.type) form.type = f.type as Task['type']
  if (f.isMicro !== undefined) form.isMicro = f.isMicro
  if (f.lifeArea) form.lifeArea = f.lifeArea as LifeAreaKey
  if (f.companyId) form.companyId = f.companyId
  // Vínculo é codificado ('p:<id>' / 'g:<id>'); o servidor já garantiu que os
  // dois não vêm juntos (o XOR do banco), então basta o que vier primeiro.
  if (f.projectId) form.vinculo = encodeVinculo(f.projectId, null)
  else if (f.goalId) form.vinculo = encodeVinculo(null, f.goalId)
  if (f.scheduledDate) form.scheduledDate = f.scheduledDate
  if (f.scheduledTime) form.scheduledTime = f.scheduledTime
  if (f.durationMinutes) form.durationMinutes = f.durationMinutes
  sug.reset()
}

/**
 * Resposta a uma pergunta da IA. Só os campos de enum têm mapeamento de rótulo
 * para valor; para o resto a resposta vira texto no campo correspondente.
 */
function answerSuggestion(field: string, value: string) {
  const TYPES: Record<string, Task['type']> = {
    CEO: 'ceo',
    Delego: 'delegate',
    Pessoal: 'personal',
  }
  if (field === 'type' && TYPES[value]) form.type = TYPES[value]!
  else if (field === 'scheduledDate' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    form.scheduledDate = value
  }
  sug.reset()
}

const lifeAreaOptions = Object.entries(AREA_META).map(([value, m]) => ({
  value: value as LifeAreaKey,
  label: m.label,
}))

// Itens da área escolhida (ex.: pessoas em Relacionamentos).
const lifeItemOptions = computed(() => {
  if (!form.lifeArea) return []
  return lifeState.value.areas.find((a) => a.key === form.lifeArea)?.items ?? []
})
// Ao trocar de área, descarta item que não pertence mais a ela.
watch(
  () => form.lifeArea,
  (area) => {
    if (!area) {
      form.lifeItemId = null
      return
    }
    if (form.lifeItemId && !lifeItemOptions.value.some((i) => i.id === form.lifeItemId)) {
      form.lifeItemId = null
    }
  },
)

// Inline-create: item de vida.
const addingLifeItem = ref(false)
const newLifeItemName = ref('')
function onLifeItemChange(value: string) {
  if (value === '__new__') {
    addingLifeItem.value = true
    newLifeItemName.value = ''
  } else {
    form.lifeItemId = value || null
  }
}
async function commitNewLifeItem() {
  if (!form.lifeArea || !newLifeItemName.value.trim()) {
    addingLifeItem.value = false
    return
  }
  const item = await addLifeItem(form.lifeArea, newLifeItemName.value)
  if (item) form.lifeItemId = item.id
  newLifeItemName.value = ''
  addingLifeItem.value = false
}

// Inline-create: projeto / meta (no seletor de vínculo).
const addingVinculo = ref<'project' | 'goal' | null>(null)
const newVinculoName = ref('')
async function commitNewVinculo() {
  const name = newVinculoName.value.trim()
  const kind = addingVinculo.value
  if (!name || !kind) {
    addingVinculo.value = null
    return
  }
  try {
    if (kind === 'project') {
      const p = await createProject({ name })
      if (p) form.vinculo = `p:${p.id}`
    } else {
      const m = await metasStore.criar({ titulo: name })
      if (m) form.vinculo = `g:${m.id}`
    }
  } catch (e) {
    formError.value = (e as { message?: string })?.message ?? 'Falha ao criar.'
  }
  newVinculoName.value = ''
  addingVinculo.value = null
}
// ── Pessoa / delegado (seleção única, UX igual à de convidados) ─────────────
// Um chip só: enquanto há delegado, escondemos o autocomplete e mostramos o chip.
const hasDelegate = computed(
  () => !!(form.delegatePersonId || form.delegateName || form.delegateEmail),
)
const delegateLabel = computed(() => form.delegateName || form.delegateEmail || '')
function setDelegate(sel: { personId: string | null; name: string; email: string | null }) {
  form.delegatePersonId = sel.personId
  form.delegateName = sel.name
  form.delegateEmail = sel.email
}
function clearDelegate() {
  form.delegatePersonId = null
  form.delegateName = ''
  form.delegateEmail = null
}

// ── Convidados (participants) ───────────────────────────────────────────────
// Ids já escolhidos — para omitir da busca e evitar duplicatas.
const participantIds = computed(() =>
  form.participants
    .map((p) => p.personId)
    .filter((id): id is string => !!id),
)
function addParticipant(sel: { personId: string | null; name: string; email: string | null }) {
  const label = (sel.name || sel.email || '').trim()
  if (!label && !sel.personId) return
  const dup = form.participants.some((p) =>
    sel.personId
      ? p.personId === sel.personId
      : (p.email ?? '').toLowerCase() === (sel.email ?? '').toLowerCase() &&
        p.name.toLowerCase() === sel.name.toLowerCase(),
  )
  if (dup) return
  form.participants.push({ personId: sel.personId, name: sel.name, email: sel.email })
}
function removeParticipant(i: number) {
  form.participants.splice(i, 1)
}

const saving = ref(false)
const formError = ref<string | null>(null)

const editing = computed(() => state.value.editing)
const isEdit = computed(() => !!editing.value?.id)
const currentTaskId = computed(() => editing.value?.id ?? null)

// Trocar de tarefa não pode carregar a sugestão da anterior. O watch mora aqui,
// e não junto do resto da lógica de sugestão lá em cima, porque `currentTaskId`
// só existe a partir desta linha — um watch antes disso estouraria na TDZ.
watch(currentTaskId, () => sug.reset())

// `complete()` troca o objeto na lista por um novo, então o `editing` capturado
// não reflete a mudança — lemos a linha viva da lista para o estado de concluído.
const isDone = computed(() => {
  const id = currentTaskId.value
  if (!id) return false
  return (taskList.value.find((t) => t.id === id)?.done ?? editing.value?.done) ?? false
})
const togglingDone = ref(false)
async function onToggleDone() {
  const id = currentTaskId.value
  if (!id || togglingDone.value) return
  togglingDone.value = true
  try {
    await complete(id, !isDone.value)
  } catch (e) {
    formError.value = (e as { message?: string })?.message ?? 'Falha ao atualizar.'
  } finally {
    togglingDone.value = false
  }
}

const horizonOptions: Array<{ value: HorizonDb; label: string }> = [
  { value: 'core7', label: '7 dias' },
  { value: 'core30', label: '30 dias' },
  { value: 'core60', label: '60 dias' },
  { value: 'core90', label: '90 dias' },
  { value: 'hibernating', label: 'Hibernando' },
]

const typeOptions: Array<{ value: Task['type']; label: string }> = [
  { value: 'ceo', label: 'CEO' },
  { value: 'delegate', label: 'Delego' },
  { value: 'personal', label: 'Pessoal' },
]

const activeProjects = computed(() =>
  projectList.value.filter((p) => !p.archived),
)
const activeMetas = computed(() => metasStore.ativas)

function decodeVinculo(v: string): { projectId: string | null; goalId: string | null } {
  if (v.startsWith('p:')) return { projectId: v.slice(2), goalId: null }
  if (v.startsWith('g:')) return { projectId: null, goalId: v.slice(2) }
  return { projectId: null, goalId: null }
}

function encodeVinculo(projectId: string | null, goalId: string | null): string {
  if (projectId) return `p:${projectId}`
  if (goalId) return `g:${goalId}`
  return ''
}

const { list: peopleList, refresh: refreshPeople } = usePeople()

watch(
  () => form.type,
  (newType) => {
    if (newType === 'personal' && !form.delegatePersonId && !form.delegateName) {
      const assistants = peopleList.value.filter((p) => p.isAssistant && !p.archived)
      if (assistants.length === 1) {
        form.delegatePersonId = assistants[0].id
        form.delegateName = assistants[0].name
        form.delegateEmail = assistants[0].email ?? null
      }
    } else if (newType === 'ceo') {
      form.delegatePersonId = null
      form.delegateName = ''
      form.delegateEmail = null
    }
  }
)

watch(
  () => state.value.open,
  (open) => {
    if (!open) {
      Object.assign(form, defaults, { participants: [] })
      return
    }
    formSession.value++ // remonta o checklist (descarta buffer de criação anterior)
    active.value = 'detalhes'
    saving.value = false
    formError.value = null
    addingLifeItem.value = false
    addingVinculo.value = null

    // Popula o form SINCRONAMENTE ao abrir — antes de qualquer await. Senão o
    // modal aparece com os valores antigos/default (ex.: 30 dias) e só troca pelo
    // preset correto (ex.: 7 dias) depois que os refreshes resolvem, causando o
    // "pisca" relatado. Os refreshes abaixo só populam opções dos selects.
    const t = editing.value
    if (t) {
      Object.assign(form, {
        title: t.title,
        description: t.description ?? '',
        horizon: t.horizon,
        isMicro: t.isMicro,
        type: t.type,
        delegatePersonId: t.delegatePersonId,
        delegateName: t.delegatePersonName ?? '',
        delegateEmail: null,
        vinculo: encodeVinculo(t.projectId, t.goalId),
        companyId: t.companyId,
        scheduledDate: t.scheduledDate ?? '',
        scheduledTime: t.scheduledTime ?? '',
        durationMinutes: t.durationMinutes,
        followupActive: t.followupActive,
        followupDate: t.followupDate ?? '',
        followupDescription: t.followupDescription ?? '',
        lifeArea: t.lifeArea,
        lifeItemId: t.lifeItemId,
        participants: (t.participants ?? []).map((p) => ({
          personId: p.personId,
          name: p.name,
          email: null,
        })),
      } satisfies FormState)
    } else {
      // Tarefa nova: aplica os defaults e, por cima, o preset (ex.: o "+" de uma
      // coluna do board já cria a tarefa no horizonte daquela coluna).
      Object.assign(form, defaults, { participants: [] }, state.value.preset ?? {})
    }

    // Opções dos selects (projetos/metas/pessoas) carregam em segundo plano —
    // não bloqueiam a abertura nem o preenchimento do form.
    ensureLifeLoaded()
    void Promise.all([refreshProjects(), metasStore.refresh(), refreshPeople()]).catch(() => {})
  },
  { immediate: true },
)

function nullIfBlank(s: string): string | null {
  return s.trim() === '' ? null : s
}

async function onSave() {
  // Re-entrância: além do botão `:disabled="saving"`, barra disparos por Enter/
  // programáticos — senão um clique-duplo/Enter rápido cria a tarefa 2x.
  if (saving.value) return
  if (!form.title.trim()) {
    formError.value = 'Título é obrigatório.'
    return
  }
  // Toda tarefa pessoal precisa estar ancorada numa área da vida.
  if (form.type === 'personal' && !form.lifeArea) {
    active.value = 'detalhes'
    formError.value = 'Tarefas pessoais precisam de uma área da vida.'
    return
  }
  formError.value = null
  saving.value = true
  try {
    const { projectId: vincProject, goalId: vincGoal } = decodeVinculo(form.vinculo)
    if (!isEdit.value) {
      const body: CreateTaskInput = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        horizon: form.horizon,
        isMicro: form.isMicro,
        type: form.type,
        delegatePersonId:
          (form.type === 'delegate' || form.type === 'personal') ? (form.delegatePersonId ?? undefined) : undefined,
        delegateName:
          (form.type === 'delegate' || form.type === 'personal') && !form.delegatePersonId
            ? form.delegateName.trim() || undefined
            : undefined,
        delegateEmail:
          (form.type === 'delegate' || form.type === 'personal') && !form.delegatePersonId
            ? form.delegateEmail || undefined
            : undefined,
        projectId: vincProject,
        goalId: vincGoal,
        companyId: form.companyId,
        scheduledDate: nullIfBlank(form.scheduledDate),
        scheduledTime: nullIfBlank(form.scheduledTime),
        durationMinutes: form.durationMinutes,
        followupActive: form.followupActive,
        followupDate: form.followupActive ? nullIfBlank(form.followupDate) : null,
        followupDescription: form.followupActive
          ? nullIfBlank(form.followupDescription.trim())
          : null,
        lifeArea: form.lifeArea,
        lifeItemId: form.lifeArea ? form.lifeItemId : null,
        participants: form.participants.length
          ? form.participants.map((p) => ({
              personId: p.personId,
              name: p.name || null,
              email: p.email || null,
            }))
          : undefined,
      }
      const created = await create(body)
      // Persiste os itens de checklist adicionados antes de a tarefa existir.
      if (created?.id) await checklistRef.value?.flush(created.id)
    } else {
      const t = editing.value!
      const typeChanged = form.type !== t.type
      const delegateChanged =
        typeChanged || form.delegatePersonId !== t.delegatePersonId
      if (delegateChanged) {
        if (form.type === 'delegate' || form.type === 'personal') {
          await reassign(t.id, {
            targetType: form.type,
            delegatePersonId: form.delegatePersonId,
            delegateName:
              !form.delegatePersonId && form.delegateName.trim()
                ? form.delegateName.trim()
                : undefined,
            delegateEmail:
              !form.delegatePersonId && form.delegateEmail
                ? form.delegateEmail
                : undefined,
          })
        } else if (form.type === 'ceo') {
          await reassign(t.id, { targetType: 'ceo', delegatePersonId: null })
        }
      }
      const patch: UpdateTaskPatch = {
        title: form.title.trim(),
        description: form.description.trim(),
        horizon: form.horizon,
        isMicro: form.isMicro,
        projectId: vincProject,
        goalId: vincGoal,
        companyId: form.companyId,
        scheduledDate: nullIfBlank(form.scheduledDate),
        scheduledTime: nullIfBlank(form.scheduledTime),
        durationMinutes: form.durationMinutes,
        followupActive: form.followupActive,
        followupDate: form.followupActive ? nullIfBlank(form.followupDate) : null,
        followupDescription: form.followupActive
          ? nullIfBlank(form.followupDescription.trim())
          : null,
        lifeArea: form.lifeArea,
        lifeItemId: form.lifeArea ? form.lifeItemId : null,
        // Sempre enviado para persistir remoções — substitui todo o conjunto.
        participants: form.participants.map((p) => ({
          personId: p.personId,
          name: p.name || null,
          email: p.email || null,
        })),
      }
      await update(t.id, patch)
    }
    close()
  } catch (e) {
    formError.value = (e as { message?: string })?.message ?? 'Falha ao salvar.'
  } finally {
    saving.value = false
  }
}

const tabs: Array<{ id: Tab; label: string; requiresId: boolean }> = [
  { id: 'detalhes', label: 'Detalhes', requiresId: false },
  // Checklist funciona na criação (buffer local + flush ao salvar) — não é gated.
  { id: 'checklist', label: 'Checklist', requiresId: false },
  { id: 'anotacoes', label: 'Anotações', requiresId: true },
  { id: 'anexos', label: 'Anexos', requiresId: true },
  { id: 'historico', label: 'Histórico', requiresId: true },
]

const headerActions = computed<ActionItem[]>(() => {
  const t = editing.value
  if (!t) return []
  return [
    {
      key: 'arquivar',
      label: t.archived ? 'Desarquivar' : 'Arquivar',
      icon: 'archive',
      tone: 'warning',
    },
    { key: 'deletar', label: 'Apagar', icon: 'trash-2', tone: 'danger' },
  ]
})

function onHeaderAction(key: string) {
  const t = editing.value
  if (!t) return
  if (key === 'arquivar') {
    const next = !t.archived
    ask(
      next ? `Arquivar "${t.title}"?` : `Desarquivar "${t.title}"?`,
      async () => {
        await archive(t.id, next)
        close()
      },
      {
        titulo: next ? 'Arquivar tarefa' : 'Desarquivar tarefa',
        okLabel: next ? 'Arquivar' : 'Desarquivar',
        okClass: 'warning',
      },
    )
    return
  }
  if (key === 'deletar') {
    ask(
      `Apagar "${t.title}" permanentemente? Essa ação não pode ser desfeita.`,
      async () => {
        await remove(t.id)
        close()
      },
      { titulo: 'Apagar tarefa', okLabel: 'Apagar', okClass: 'danger' },
    )
  }
}
</script>

<template>
  <AppSheet v-model:open="isOpen" :dismissible="!saving">
    <div class="task-modal">
        <header class="modal-head">
          <h2>{{ isEdit ? 'Editar tarefa' : 'Nova tarefa' }}</h2>
          <div class="modal-head-actions">
            <BaseActionMenu
              v-if="isEdit"
              :items="headerActions"
              aria-label="Mais ações da tarefa"
              size="md"
              @select="onHeaderAction"
            />
            <button
              class="btn icon ghost"
              type="button"
              aria-label="Fechar"
              :disabled="saving"
              @click="close"
            >
              <BaseIcon name="x" :size="16" />
            </button>
          </div>
        </header>

        <nav class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="tab"
            :class="{ active: active === tab.id, locked: tab.requiresId && !currentTaskId }"
            @click="active = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <div class="modal-body">
          <section v-show="active === 'detalhes'" class="form">
            <div class="field">
              <label>Título</label>
              <input
                v-model="form.title"
                type="text"
                placeholder="O que precisa fazer?"
              />
            </div>

            <div class="field">
              <label>Descrição</label>
              <textarea
                v-model="form.description"
                rows="3"
                placeholder="Contexto, links, decisão…"
              />
            </div>

            <!-- Sugestão da IA: só depois de salvar (precisa de id) e sempre a
                 pedido — ver o comentário em `onSuggest`. -->
            <TarefasTaskSuggestionBanner
              v-if="sug.hasSomething.value && sug.suggestion.value"
              :suggestion="sug.suggestion.value"
              :loading="sug.loading.value"
              @apply="applySuggestion"
              @dismiss="sug.reset()"
              @answer="answerSuggestion"
            />
            <div v-else-if="isEdit" class="sug-row">
              <BaseButton
                variant="ghost"
                size="sm"
                icon-left="sparkles"
                :disabled="sug.loading.value"
                @click="onSuggest"
              >
                {{ sug.loading.value ? 'Analisando…' : 'Sugerir campos com IA' }}
              </BaseButton>
              <span v-if="sug.error.value" class="sug-err">{{ sug.error.value }}</span>
            </div>

            <div class="row three">
              <div class="field">
                <label>Horizonte</label>
                <select v-model="form.horizon">
                  <option
                    v-for="o in horizonOptions"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
              </div>
              <div class="field">
                <label>Tipo</label>
                <select v-model="form.type">
                  <option
                    v-for="o in typeOptions"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="micro-toggle" :class="{ 'is-active': form.isMicro }">
              <AppToggle
                v-model="form.isMicro"
                size="sm"
                aria-label="Marcar como Micro"
              />
              <div class="micro-toggle-text">
                <div class="micro-toggle-title">
                  <BaseIcon name="zap" :size="13" />
                  Micro · ação rápida
                </div>
                <div class="micro-toggle-sub">Destaque para tarefas de até ~30 min</div>
              </div>
            </div>

            <div class="row" :class="form.lifeArea ? 'two' : ''">
              <div class="field">
                <label>Área da vida <span v-if="form.type === 'personal'" class="req">*</span></label>
                <select v-model="form.lifeArea" :class="{ invalid: form.type === 'personal' && !form.lifeArea }">
                  <option :value="null">{{ form.type === 'personal' ? '— selecione —' : '— nenhuma —' }}</option>
                  <option v-for="o in lifeAreaOptions" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                </select>
              </div>
              <div v-if="form.lifeArea" class="field">
                <label>Item</label>
                <div v-if="addingLifeItem" class="inline-create">
                  <input
                    v-model="newLifeItemName"
                    type="text"
                    placeholder="Novo item…"
                    maxlength="40"
                    @keydown.enter.prevent="commitNewLifeItem"
                    @keydown.esc="addingLifeItem = false"
                  >
                  <button type="button" class="btn sm primary" @click="commitNewLifeItem">
                    Add
                  </button>
                </div>
                <select
                  v-else
                  :value="form.lifeItemId"
                  @change="onLifeItemChange(($event.target as HTMLSelectElement).value)"
                >
                  <option :value="''">— geral —</option>
                  <option v-for="it in lifeItemOptions" :key="it.id" :value="it.id">
                    {{ it.name }}
                  </option>
                  <option value="__new__">＋ Novo item…</option>
                </select>
              </div>
            </div>

            <div v-if="form.type === 'delegate'" class="field">
              <label>Pessoa</label>
              <DelegacaoPessoaAutocomplete
                v-if="!hasDelegate"
                :model-value="null"
                name=""
                multiple
                exclude-assistant
                placeholder="Nome ou email…"
                @select="setDelegate"
              />
              <div v-else class="chips">
                <span class="chip">
                  <BaseIcon name="user" :size="12" />
                  <span class="chip-label">{{ delegateLabel }}</span>
                  <button
                    type="button"
                    class="chip-x"
                    aria-label="Remover pessoa"
                    @click="clearDelegate"
                  >
                    <BaseIcon name="x" :size="12" />
                  </button>
                </span>
              </div>
            </div>

            <div v-if="form.type === 'personal'" class="field">
              <label>Assistente</label>
              <DelegacaoPessoaAutocomplete
                v-if="!hasDelegate"
                :model-value="null"
                name=""
                multiple
                only-assistants
                placeholder="Selecionar assistente…"
                @select="setDelegate"
              />
              <div v-else class="chips">
                <span class="chip">
                  <BaseIcon name="user" :size="12" />
                  <span class="chip-label">{{ delegateLabel }}</span>
                  <button
                    type="button"
                    class="chip-x"
                    aria-label="Remover assistente"
                    @click="clearDelegate"
                  >
                    <BaseIcon name="x" :size="12" />
                  </button>
                </span>
              </div>
            </div>

            <div class="field">
              <label>Convidados</label>
              <DelegacaoPessoaAutocomplete
                :model-value="null"
                name=""
                multiple
                :exclude-ids="participantIds"
                placeholder="Adicionar pessoa ou email…"
                @select="addParticipant"
              />
              <div v-if="form.participants.length" class="chips">
                <span
                  v-for="(p, i) in form.participants"
                  :key="p.personId || p.email || p.name || i"
                  class="chip"
                >
                  <BaseIcon name="user" :size="12" />
                  <span class="chip-label">{{ p.name || p.email }}</span>
                  <button
                    type="button"
                    class="chip-x"
                    aria-label="Remover convidado"
                    @click="removeParticipant(i)"
                  >
                    <BaseIcon name="x" :size="12" />
                  </button>
                </span>
              </div>
              <div class="field-hint">
                Convidados com email recebem um convite para criar conta ao salvar.
              </div>
            </div>

            <div class="field">
              <label>Vínculo</label>
              <div v-if="addingVinculo" class="inline-create">
                <input
                  v-model="newVinculoName"
                  type="text"
                  :placeholder="addingVinculo === 'project' ? 'Novo projeto…' : 'Nova meta…'"
                  maxlength="120"
                  @keydown.enter.prevent="commitNewVinculo"
                  @keydown.esc="addingVinculo = null"
                >
                <button type="button" class="btn sm primary" @click="commitNewVinculo">Add</button>
                <button
                  type="button"
                  class="btn sm ghost"
                  aria-label="Cancelar"
                  @click="addingVinculo = null"
                >
                  <BaseIcon name="x" :size="14" />
                </button>
              </div>
              <select v-else v-model="form.vinculo">
                <option value="">— solta (sem projeto/meta) —</option>
                <optgroup v-if="activeProjects.length > 0" label="Projetos">
                  <option
                    v-for="p in activeProjects"
                    :key="`p-${p.id}`"
                    :value="`p:${p.id}`"
                  >
                    {{ p.name }}
                  </option>
                </optgroup>
                <optgroup v-if="activeMetas.length > 0" label="Metas">
                  <option
                    v-for="m in activeMetas"
                    :key="`g-${m.id}`"
                    :value="`g:${m.id}`"
                  >
                    {{ m.titulo }}
                  </option>
                </optgroup>
              </select>
              <div v-if="!addingVinculo" class="vinculo-actions">
                <button type="button" class="link-btn" @click="addingVinculo = 'project'">
                  ＋ Novo projeto
                </button>
                <button type="button" class="link-btn" @click="addingVinculo = 'goal'">
                  ＋ Nova meta
                </button>
              </div>
            </div>

            <div class="field">
              <label>Empresa</label>
              <CompanyAutocomplete
                v-model="form.companyId"
                placeholder="Buscar ou criar empresa…"
              />
              <div class="field-hint">
                Vincule a uma empresa para reuso entre tarefas, metas e projetos.
              </div>
            </div>

            <div v-if="isEdit && editing?.id" class="field">
              <label>Quadros</label>
              <TaskBoardsField :key="editing.id" :task-id="editing.id" />
              <div class="field-hint">
                Marcar coloca a tarefa na primeira coluna do quadro. Em quadro
                compartilhado, isso dá acesso à tarefa para os membros.
              </div>
            </div>

            <div class="row three">
              <div class="field">
                <label>Data</label>
                <input v-model="form.scheduledDate" type="date" />
              </div>
              <div class="field">
                <label>Hora</label>
                <input v-model="form.scheduledTime" type="time" />
              </div>
              <div class="field">
                <label>Duração (min)</label>
                <input
                  v-model.number="form.durationMinutes"
                  type="number"
                  min="15"
                  step="15"
                  placeholder="—"
                />
              </div>
            </div>

            <div class="followup-section">
              <div class="followup-label">Follow-up</div>
              <div class="followup" :class="{ 'is-active': form.followupActive }">
                <div class="followup-head">
                  <AppToggle
                    v-model="form.followupActive"
                    size="sm"
                    aria-label="Marcar como follow-up"
                  />
                  <div class="followup-head-text">
                    <div class="followup-title">Marcar como follow-up</div>
                    <div class="followup-sub">Aparece em amarelo na agenda</div>
                  </div>
                </div>
                <div v-if="form.followupActive" class="row two">
                  <div class="field">
                    <label>Data de cobrança</label>
                    <input v-model="form.followupDate" type="date" />
                  </div>
                  <div class="field">
                    <label>Descrição</label>
                    <input
                      v-model="form.followupDescription"
                      type="text"
                      maxlength="2000"
                      placeholder="Ex.: aguardando aprovação"
                    />
                    <div class="field-hint">Vazio = você · Nome = aguardando pessoa</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section v-show="active === 'checklist'">
            <!-- Sem currentTaskId (criação) o checklist opera em buffer local;
                 onSave faz o flush() na tarefa recém-criada. A key remonta o
                 componente a cada abertura, descartando buffer de sessões antigas. -->
            <TarefasChecklist :key="formSession" ref="checklistRef" :task-id="currentTaskId" />
          </section>
          <section v-show="active === 'anotacoes'">
            <TarefasAnotacoes v-if="currentTaskId" :task-id="currentTaskId" />
            <p v-else class="tab-locked-hint">Salve a tarefa para adicionar anotações.</p>
          </section>
          <section v-show="active === 'anexos'">
            <AnexosList v-if="currentTaskId" entity="task" :entity-id="currentTaskId" />
            <p v-else class="tab-locked-hint">Salve a tarefa para anexar arquivos.</p>
          </section>
          <section v-show="active === 'historico'">
            <TarefasHistoricoTimeline v-if="currentTaskId" :task-id="currentTaskId" />
            <p v-else class="tab-locked-hint">O histórico aparece depois que a tarefa é criada.</p>
          </section>
        </div>

        <footer class="modal-foot">
          <button
            v-if="isEdit"
            type="button"
            class="done-toggle"
            :class="{ done: isDone }"
            :disabled="togglingDone"
            :aria-pressed="isDone"
            @click="onToggleDone"
          >
            <span class="dt-check" />
            {{ isDone ? 'Concluída' : 'Concluir' }}
          </button>
          <div v-if="formError" class="form-error">{{ formError }}</div>
          <div class="actions">
            <button class="btn ghost" :disabled="saving" @click="close">
              Cancelar
            </button>
            <button class="btn primary" :disabled="saving" @click="onSave">
              {{ saving ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </footer>
    </div>
  </AppSheet>
</template>

<style scoped>
.task-modal {
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  min-height: 420px;
  width: min(720px, 96vw);
  background: var(--panel);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
}
.modal-head h2 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.018em;
  color: var(--text);
}
.modal-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tabs {
  display: flex;
  gap: 18px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 10px 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-3);
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-spring),
    border-color var(--dur-fast) var(--ease-spring);
}
.tab:hover:not(:disabled):not(.active) {
  color: var(--text);
}
.tab:disabled {
  color: var(--text-4);
  cursor: not-allowed;
}
/* Tab disponível mas gated (tarefa ainda não salva): navegável, só atenuada. */
.tab.locked:not(.active) {
  color: var(--text-4);
}
.tab-locked-hint {
  margin: 0;
  padding: 8px 2px;
  font-size: 13px;
  color: var(--text-3);
}
.tab.active {
  color: var(--text);
  font-weight: 600;
  border-bottom-color: var(--accent);
}
.modal-body {
  padding: 18px 20px;
  overflow-y: auto;
  flex: 1;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sug-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sug-err {
  font-size: var(--fs-12);
  color: var(--text-3);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.field label .req {
  color: var(--danger);
}
.field select.invalid {
  border-color: var(--danger);
}
.readonly {
  padding: 6px 10px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-2);
}
.row {
  display: grid;
  gap: 10px;
}
.row.two {
  grid-template-columns: 1fr 1fr;
}
.row.three {
  grid-template-columns: repeat(3, 1fr);
}
.grow {
  flex: 1;
}
.micro-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border);
  background: var(--surface-alt);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  transition: background 0.15s, border-color 0.15s;
}
.micro-toggle.is-active {
  background: color-mix(in srgb, var(--micro-bar) 10%, transparent);
  border-color: var(--micro-bar);
}
.micro-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.micro-toggle-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}
.micro-toggle.is-active .micro-toggle-title {
  color: var(--micro-bar);
}
.micro-toggle-sub {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.2;
}
.followup-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.followup-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
}
.followup {
  border: 1px solid var(--border);
  background: var(--surface-alt);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: background 0.15s, border-color 0.15s;
}
.followup.is-active {
  background: var(--followup-bg);
  border-color: var(--followup-fg);
}
.followup-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.followup-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.followup-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}
.followup-sub {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.2;
}
.field-hint {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 4px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  max-width: 100%;
}
.chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.chip-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-3);
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur-fast) var(--ease-spring),
              color var(--dur-fast) var(--ease-spring);
}
.chip-x:hover {
  background: var(--danger-bg);
  color: var(--danger);
}
.modal-foot {
  border-top: 1px solid var(--border-faint);
  background: var(--surface-alt);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.form-error {
  flex: 1;
  font-size: 12px;
  color: var(--danger);
}
.done-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.done-toggle:hover:not(:disabled) {
  border-color: var(--success);
  color: var(--success);
}
.done-toggle:disabled {
  opacity: 0.6;
  cursor: default;
}
.done-toggle .dt-check {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: var(--surface-alt);
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s;
}
.done-toggle .dt-check::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 5px;
  height: 9px;
  border: solid var(--accent-fg);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  opacity: 0;
  transition: opacity 0.12s;
}
.done-toggle:hover:not(:disabled) .dt-check {
  border-color: var(--success);
}
.done-toggle.done {
  border-color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
  color: var(--success);
}
.done-toggle.done .dt-check {
  background: var(--success);
  border-color: var(--success);
}
.done-toggle.done .dt-check::after {
  opacity: 1;
}
.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.inline-create {
  display: flex;
  align-items: center;
  gap: 6px;
}
.inline-create input {
  flex: 1;
  min-width: 0;
}
.vinculo-actions {
  display: flex;
  gap: 16px;
  margin-top: 6px;
}
.link-btn {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: transparent;
}
.link-btn:hover {
  text-decoration: underline;
}
.btn.sm {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.btn.sm.primary {
  background: var(--primary);
  color: var(--on-primary);
}
.btn.sm.ghost {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-2);
}
</style>

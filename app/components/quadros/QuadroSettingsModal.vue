<script setup lang="ts">
import { useToast } from '~/composables/useToast'
import { useConfirm } from '~/composables/useConfirm'

const props = defineProps<{ boardId: string }>()
const emit = defineEmits<{ close: [] }>()

const { board, members, addMember, removeMember } = useBoard(props.boardId)
const { update, remove, leave } = useBoards()
const { list: people, refresh: refreshPeople } = usePeople()
const { show: toast } = useToast()
const { ask: askConfirm } = useConfirm()
const router = useRouter()

const name = ref(board.value?.name ?? '')
const icon = ref(board.value?.icon ?? 'columns-3')
const isOwner = computed(() => board.value?.isOwner ?? false)

onMounted(() => {
  refreshPeople().catch(() => {})
})

const ICONS = [
  'columns-3',
  'building-2',
  'briefcase',
  'target',
  'rocket',
  'folder',
  'flag',
  'star',
]

async function saveBoard() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  try {
    await update(props.boardId, { name: trimmed, icon: icon.value })
    if (board.value) board.value = { ...board.value, name: trimmed, icon: icon.value }
    toast('Quadro atualizado.')
  } catch {
    toast('Não foi possível salvar o quadro.')
  }
}

// ── Membros ──
const memberQuery = ref('')
const memberEmail = ref('')

const memberCandidates = computed(() => {
  const already = new Set(members.value.map((m) => m.personId))
  const q = memberQuery.value.trim().toLowerCase()
  if (!q) return []
  return people.value
    .filter((p) => !p.archived && !already.has(p.id))
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, 6)
})

async function addExistingPerson(personId: string) {
  try {
    await addMember({ personId })
    memberQuery.value = ''
    toast('Membro adicionado — ele passa a enxergar as tarefas do quadro.')
  } catch {
    toast('Não foi possível adicionar o membro.')
  }
}

async function inviteByEmail() {
  const email = memberEmail.value.trim()
  if (!email) return
  try {
    await addMember({ email })
    memberEmail.value = ''
    toast('Convite enviado.')
  } catch {
    toast('Não foi possível convidar.')
  }
}

function onRemoveMember(personId: string, memberName: string) {
  askConfirm(
    `Remover ${memberName} do quadro? As tarefas que ${memberName} colocou aqui permanecem no quadro.`,
    async () => {
      try {
        await removeMember(personId)
      } catch {
        toast('Não foi possível remover o membro.')
      }
    },
  )
}

// ── Ações destrutivas ──
async function onArchive() {
  try {
    await update(props.boardId, { archived: true })
    emit('close')
    await router.push('/quadros')
  } catch {
    toast('Não foi possível arquivar.')
  }
}

function onDelete() {
  askConfirm(
    'Apagar este quadro? As colunas e a organização somem. As tarefas continuam existindo.',
    async () => {
      try {
        await remove(props.boardId)
        emit('close')
        await router.push('/quadros')
      } catch {
        toast('Não foi possível apagar o quadro.')
      }
    },
  )
}

function onLeave() {
  askConfirm('Sair deste quadro? Você deixa de enxergar as tarefas dele.', async () => {
    try {
      await leave(props.boardId)
      emit('close')
      await router.push('/quadros')
    } catch {
      toast('Não foi possível sair do quadro.')
    }
  })
}
</script>

<template>
  <AppModal :open="true" titulo="Configurações do quadro" @close="emit('close')">
    <div class="qs">
      <section v-if="isOwner" class="qs-sec">
        <label class="qs-label" for="qs-name">Nome</label>
        <input id="qs-name" v-model="name" class="qs-input" type="text" @blur="saveBoard">

        <span class="qs-label">Ícone</span>
        <div class="qs-icons">
          <button
            v-for="ic in ICONS"
            :key="ic"
            type="button"
            class="qs-icon"
            :class="{ active: icon === ic }"
            :aria-pressed="icon === ic"
            @click="icon = ic; saveBoard()"
          >
            <BaseIcon :name="ic" :size="17" />
          </button>
        </div>
      </section>

      <section class="qs-sec">
        <span class="qs-label">Membros</span>
        <p class="qs-note">
          Quem é membro enxerga e edita <strong>todas</strong> as tarefas deste
          quadro. Colocar uma tarefa aqui é compartilhá-la.
        </p>

        <ul v-if="members.length" class="qs-members">
          <li v-for="m in members" :key="m.personId" class="qs-member">
            <span class="qs-member-name">
              {{ m.name }}
              <span v-if="!m.hasAccount" class="qs-pending" title="Ainda não aceitou o convite">
                convite pendente
              </span>
            </span>
            <button
              v-if="isOwner"
              type="button"
              class="qs-remove"
              :aria-label="`Remover ${m.name}`"
              @click="onRemoveMember(m.personId, m.name)"
            >
              <BaseIcon name="x" :size="14" />
            </button>
          </li>
        </ul>
        <p v-else class="qs-empty">Ninguém além de você.</p>

        <template v-if="isOwner">
          <input
            v-model="memberQuery"
            class="qs-input"
            type="text"
            placeholder="Buscar pessoa…"
          >
          <ul v-if="memberCandidates.length" class="qs-cands">
            <li v-for="p in memberCandidates" :key="p.id">
              <button type="button" class="qs-cand" @click="addExistingPerson(p.id)">
                {{ p.name }}
              </button>
            </li>
          </ul>

          <div class="qs-invite">
            <input
              v-model="memberEmail"
              class="qs-input"
              type="email"
              placeholder="Convidar por email"
              @keydown.enter.prevent="inviteByEmail"
            >
            <button type="button" class="qs-btn" @click="inviteByEmail">Convidar</button>
          </div>
        </template>
      </section>

      <section class="qs-sec qs-danger">
        <template v-if="isOwner">
          <button type="button" class="qs-btn" @click="onArchive">Arquivar quadro</button>
          <button type="button" class="qs-btn danger" @click="onDelete">Apagar quadro</button>
        </template>
        <button v-else type="button" class="qs-btn danger" @click="onLeave">
          Sair do quadro
        </button>
      </section>
    </div>
  </AppModal>
</template>

<style scoped>
.qs {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.qs-sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.qs-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.qs-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}
.qs-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
}
.qs-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.qs-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  color: var(--text-3);
}
.qs-icon.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.qs-members,
.qs-cands {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.qs-member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-2);
}
.qs-member:hover {
  background: var(--surface-hover);
}
.qs-member-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.qs-pending {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-4);
}
.qs-remove {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-4);
}
.qs-remove:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.qs-cand {
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  font-size: 13px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.qs-cand:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.qs-empty {
  font-size: 12px;
  color: var(--text-4);
}
.qs-invite {
  display: flex;
  gap: 6px;
}
.qs-btn {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.qs-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.qs-btn.danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}
.qs-danger {
  flex-direction: row;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
</style>

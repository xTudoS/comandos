<script setup lang="ts">
const people = usePeople()

const newName = ref('')
const creating = ref(false)
const createErr = ref('')

const inviteFor = ref<string | null>(null)
const inviteEmail = ref('')
const inviting = ref(false)
const inviteErr = ref('')

const busyId = ref<string | null>(null)
const actionErr = ref('')

onMounted(() => people.refresh())

const activePeople = computed(() => people.list.value)

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

// Deterministic avatar tint from the name so each person reads consistently.
const AVATAR_TINTS = ['ceo', 'delego', 'pessoal', 'accent', 'micro'] as const
function tintFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[h % AVATAR_TINTS.length]!
}

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  createErr.value = ''
  try {
    await people.create({ name })
    newName.value = ''
  } catch (e) {
    createErr.value = extract(e, 'Falha ao adicionar.')
  } finally {
    creating.value = false
  }
}

function openInvite(id: string) {
  inviteFor.value = id
  inviteEmail.value = ''
  inviteErr.value = ''
}

function closeInvite() {
  inviteFor.value = null
  inviteEmail.value = ''
  inviteErr.value = ''
}

async function onInvite() {
  if (!inviteFor.value) return
  const email = inviteEmail.value.trim()
  if (!email) return
  inviting.value = true
  inviteErr.value = ''
  try {
    await people.invite(inviteFor.value, email)
    closeInvite()
  } catch (e) {
    inviteErr.value = extract(e, 'Falha ao enviar convite.')
  } finally {
    inviting.value = false
  }
}

async function onSetAssistant(id: string) {
  busyId.value = id
  actionErr.value = ''
  try {
    await people.setAssistant(id)
  } catch (e) {
    actionErr.value = extract(e, 'Falha ao tornar assistente.')
  } finally {
    busyId.value = null
  }
}

async function onArchive(id: string) {
  busyId.value = id
  actionErr.value = ''
  try {
    await people.archive(id)
  } catch (e) {
    actionErr.value = extract(e, 'Falha ao arquivar.')
  } finally {
    busyId.value = null
  }
}

function extract(e: unknown, fallback: string): string {
  const err = e as { data?: { error?: { message?: string } }; message?: string }
  return err?.data?.error?.message ?? err?.message ?? fallback
}
</script>

<template>
  <div class="people-page">
    <PageHero
      title="Pessoas e assistente"
      description="Pessoas a quem você pode delegar tarefas. Convide por email para vincular uma conta; defina um assistente para receber encaminhamentos automáticos."
    />

    <!-- Add person -->
    <form class="add-bar" @submit.prevent="onCreate">
      <span class="add-ico"><BaseIcon name="user-plus" :size="17" /></span>
      <input
        v-model="newName"
        type="text"
        class="add-input"
        placeholder="Nome da pessoa…"
        aria-label="Nome da nova pessoa"
      />
      <button
        type="submit"
        class="btn primary"
        :disabled="!newName.trim() || creating"
      >
        {{ creating ? 'Adicionando…' : 'Adicionar' }}
      </button>
    </form>
    <p v-if="createErr" class="err-line">
      <BaseIcon name="triangle-alert" :size="14" />{{ createErr }}
    </p>
    <p v-if="actionErr" class="err-line">
      <BaseIcon name="triangle-alert" :size="14" />{{ actionErr }}
    </p>

    <!-- List -->
    <ul v-if="activePeople.length" class="people-list">
      <li v-for="p in activePeople" :key="p.id" class="person">
        <div class="person-row">
          <span class="avatar" :class="tintFor(p.name)">{{ initials(p.name) }}</span>

          <div class="person-info">
            <span class="person-name">{{ p.name }}</span>
            <span class="person-tags">
              <span v-if="p.isAssistant" class="tag assistant">
                <BaseIcon name="sparkles" :size="11" />Assistente
              </span>
              <span v-if="p.linkedUserId" class="tag linked">
                <BaseIcon name="link" :size="11" />Conta vinculada
              </span>
              <span v-else class="tag pending">
                <BaseIcon name="clock" :size="11" />Pendente
              </span>
              <span v-if="p.email" class="person-email">{{ p.email }}</span>
            </span>
          </div>

          <div class="person-actions">
            <button
              v-if="!p.linkedUserId"
              type="button"
              class="btn ghost"
              :disabled="busyId === p.id"
              @click="openInvite(p.id)"
            >
              <BaseIcon name="mail" :size="14" />Convidar
            </button>
            <button
              v-if="p.linkedUserId && !p.isAssistant"
              type="button"
              class="btn ghost"
              :disabled="busyId === p.id"
              @click="onSetAssistant(p.id)"
            >
              <BaseIcon name="sparkles" :size="14" />
              {{ busyId === p.id ? '…' : 'Tornar assistente' }}
            </button>
            <button
              type="button"
              class="btn danger icon-only"
              :disabled="busyId === p.id"
              :aria-label="`Arquivar ${p.name}`"
              @click="onArchive(p.id)"
            >
              <BaseIcon name="archive" :size="15" />
            </button>
          </div>
        </div>

        <!-- Inline invite -->
        <Transition name="invite">
          <div v-if="inviteFor === p.id" class="invite-panel">
            <div class="invite-field">
              <BaseIcon name="mail" :size="15" class="invite-ico" />
              <input
                v-model="inviteEmail"
                type="email"
                class="invite-input"
                placeholder="email@exemplo.com"
                autocomplete="email"
                aria-label="Email do convite"
                @keyup.enter="onInvite"
              />
            </div>
            <div class="invite-btns">
              <button
                type="button"
                class="btn primary"
                :disabled="!inviteEmail.trim() || inviting"
                @click="onInvite"
              >
                {{ inviting ? 'Enviando…' : 'Enviar convite' }}
              </button>
              <button
                type="button"
                class="btn ghost"
                :disabled="inviting"
                @click="closeInvite"
              >
                Cancelar
              </button>
            </div>
            <p v-if="inviteErr" class="err-line">
              <BaseIcon name="triangle-alert" :size="14" />{{ inviteErr }}
            </p>
          </div>
        </Transition>
      </li>
    </ul>

    <BaseEmptyState
      v-else-if="!people.loading.value"
      icon="users"
      big
    >
      <strong>Nenhuma pessoa cadastrada</strong><br>
      Adicione a primeira pessoa no campo acima para começar a delegar.
    </BaseEmptyState>
  </div>
</template>

<style scoped>
.people-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px 26px 60px;
  max-width: 820px;
  margin: 0 auto;
}

/* ── Add bar ── */
.add-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
.add-ico {
  color: var(--text-3);
  display: inline-flex;
  flex-shrink: 0;
}
.add-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 6px 0;
  font-size: 14px;
  color: var(--text);
  width: auto;
}
.add-input:focus {
  outline: none;
  border: none;
  box-shadow: none;
}
.add-input::placeholder {
  color: var(--text-4);
}

/* ── List ── */
.people-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.person {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: border-color var(--dur-fast) var(--ease-spring);
}
.person:hover {
  border-color: var(--border-strong);
}
.person-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
}
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  flex-shrink: 0;
  user-select: none;
}
.avatar.ceo {
  background: var(--ceo-bg);
  color: var(--ceo-fg);
}
.avatar.delego {
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.avatar.pessoal {
  background: var(--pessoal-bg);
  color: var(--pessoal-fg);
}
.avatar.accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.avatar.micro {
  background: color-mix(in srgb, var(--micro-bar) 16%, transparent);
  color: var(--micro-bar);
}

.person-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.person-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.person-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.tag.assistant {
  background: var(--accent-soft);
  color: var(--accent);
}
.tag.linked {
  background: var(--success-bg);
  color: var(--success);
}
.tag.pending {
  background: var(--surface-hover);
  color: var(--text-3);
}
.person-email {
  font-size: 12px;
  color: var(--text-4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.person-actions .btn.icon-only {
  padding: 0;
  width: 34px;
  height: 34px;
}

/* ── Invite panel ── */
.invite-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 16px;
  margin: 0 8px 8px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.invite-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
  padding: 0 12px;
  height: 38px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-spring),
    box-shadow var(--dur-fast) var(--ease-spring);
}
.invite-field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.invite-ico {
  color: var(--text-3);
  flex-shrink: 0;
}
.invite-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 14px;
  color: var(--text);
  width: auto;
}
.invite-input:focus {
  outline: none;
  border: none;
  box-shadow: none;
}
.invite-btns {
  display: flex;
  gap: 8px;
}

.invite-enter-active,
.invite-leave-active {
  transition: opacity var(--dur-fast) var(--ease-spring),
    transform var(--dur-fast) var(--ease-spring);
  overflow: hidden;
}
.invite-enter-from,
.invite-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ── Errors ── */
.err-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--danger);
  margin: -8px 2px 0;
}

@media (max-width: 680px) {
  .people-page {
    padding: 18px 16px 80px;
  }
  .person-row {
    flex-wrap: wrap;
  }
  .person-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>

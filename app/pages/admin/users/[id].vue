<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

type AdminUser = {
  id: string
  email: string
  name: string
  role: 'owner' | 'delegate'
  createdAt: string
  passkeyCount: number
}

const route = useRoute()
const id = computed(() => route.params.id as string)

const { data, pending, error, refresh } = await useFetch<{ users: AdminUser[] }>(
  '/api/admin/users',
)

const user = computed(() =>
  data.value?.users.find((u) => u.id === id.value) ?? null,
)

const confirmOpen = ref(false)
const resetting = ref(false)
const resetStatus = ref<string | null>(null)
const resetError = ref<string | null>(null)

async function onReset() {
  resetting.value = true
  resetStatus.value = null
  resetError.value = null
  try {
    const res = await $fetch<{
      ok: true
      passkeysDeleted: number
      approvalsDeleted: number
    }>(`/api/admin/users/${id.value}/reset-devices`, { method: 'POST' })
    resetStatus.value = `Removidos ${res.passkeysDeleted} passkey(s) e ${res.approvalsDeleted} aprovação(ões). O usuário voltará ao bootstrap.`
    await refresh()
  } catch (e) {
    resetError.value = (e as { message?: string })?.message ?? 'Falha ao resetar.'
  } finally {
    resetting.value = false
    confirmOpen.value = false
  }
}
</script>

<template>
  <div class="admin-user">
    <div class="crumb">
      <NuxtLink to="/admin/users" class="back">‹ Usuários</NuxtLink>
    </div>

    <div v-if="pending" class="state">Carregando…</div>
    <div v-else-if="error" class="state error">Falha ao carregar.</div>
    <div v-else-if="!user" class="state">Usuário não encontrado.</div>

    <template v-else>
      <header>
        <h1>{{ user.name }}</h1>
        <div class="meta">
          <span class="role" :class="user.role">{{ user.role }}</span>
          <span>{{ user.email }}</span>
        </div>
      </header>

      <section class="card">
        <h2>Dispositivos e passkeys</h2>
        <p>
          Este usuário possui <strong>{{ user.passkeyCount }}</strong>
          passkey{{ user.passkeyCount === 1 ? '' : 's' }} registrada{{ user.passkeyCount === 1 ? '' : 's' }}.
        </p>
        <p class="warn">
          Resetar apaga todas as passkeys e aprovações de dispositivo deste usuário.
          Ele voltará ao fluxo de bootstrap (OTP por e-mail + nova passkey) no próximo login.
        </p>
        <div class="row">
          <button
            class="btn danger"
            type="button"
            :disabled="resetting"
            @click="confirmOpen = true"
          >
            Resetar dispositivos
          </button>
          <span v-if="resetting" class="hint">Resetando…</span>
        </div>
        <div v-if="resetStatus" class="notice ok">{{ resetStatus }}</div>
        <div v-if="resetError" class="notice err">{{ resetError }}</div>
      </section>
    </template>

    <AppSheet v-model:open="confirmOpen" :dismissible="!resetting">
      <div class="confirm">
        <h3>Confirmar reset</h3>
        <p>
          Apagar todas as passkeys e aprovações de
          <strong>{{ user?.name }}</strong>? Esta ação é irreversível.
        </p>
        <div class="confirm-actions">
          <button
            class="btn ghost"
            type="button"
            :disabled="resetting"
            @click="confirmOpen = false"
          >
            Cancelar
          </button>
          <button
            class="btn danger"
            type="button"
            :disabled="resetting"
            @click="onReset"
          >
            {{ resetting ? 'Resetando…' : 'Resetar dispositivos' }}
          </button>
        </div>
      </div>
    </AppSheet>
  </div>
</template>

<style scoped>
.admin-user {
  padding: 20px 24px 40px;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.crumb .back {
  font-size: 11px;
  color: var(--text-3);
  text-decoration: none;
}
.crumb .back:hover {
  color: var(--accent);
}
h1 {
  font-size: 18px;
  font-weight: 600;
}
header .meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}
.role {
  font-size: 10px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.role.owner {
  background: var(--ceo-bg);
  color: var(--ceo-fg);
}
.role.delegate {
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card h2 {
  font-size: 13px;
  font-weight: 600;
}
.card p {
  font-size: 12px;
  color: var(--text-2);
}
.card .warn {
  color: var(--text-3);
}
.card .row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hint {
  font-size: 11px;
  color: var(--text-3);
}
.notice {
  font-size: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
}
.notice.ok {
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.notice.err {
  background: var(--ceo-bg);
  color: var(--ceo-fg);
}
.state {
  padding: 24px;
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
  font-style: italic;
}
.state.error {
  color: var(--danger);
}
.confirm {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
}
.confirm h3 {
  font-size: 14px;
  font-weight: 600;
}
.confirm p {
  font-size: 13px;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

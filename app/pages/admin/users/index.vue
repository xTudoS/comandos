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

const { data, pending, error, refresh } = await useFetch<{ users: AdminUser[] }>(
  '/api/admin/users',
)

const users = computed(() => data.value?.users ?? [])

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="admin-users">
    <header>
      <div class="crumb">
        <NuxtLink to="/settings" class="back">‹ Configurações</NuxtLink>
      </div>
      <h1>Admin — Usuários</h1>
      <p class="sub">
        Lista global do tenant. Apenas owners.
      </p>
    </header>

    <div v-if="pending" class="state">Carregando…</div>
    <div v-else-if="error" class="state error">Falha ao carregar usuários.</div>
    <div v-else-if="users.length === 0" class="state">Sem usuários.</div>

    <ul v-else class="rows">
      <li v-for="u in users" :key="u.id" class="row">
        <div class="main">
          <div class="top">
            <span class="name">{{ u.name }}</span>
            <span class="role" :class="u.role">{{ u.role }}</span>
          </div>
          <div class="meta">
            <span>{{ u.email }}</span>
            <span>·</span>
            <span>{{ u.passkeyCount }} passkey{{ u.passkeyCount === 1 ? '' : 's' }}</span>
            <span>·</span>
            <span>desde {{ fmtDate(u.createdAt) }}</span>
          </div>
        </div>
        <NuxtLink :to="`/admin/users/${u.id}`" class="manage">Gerenciar ›</NuxtLink>
      </li>
    </ul>

    <div class="actions">
      <button class="btn ghost" type="button" @click="() => refresh()">Recarregar</button>
    </div>
  </div>
</template>

<style scoped>
.admin-users {
  padding: 20px 24px 40px;
  max-width: 860px;
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
  margin-top: 2px;
}
.sub {
  font-size: 12px;
  color: var(--text-3);
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.name {
  font-size: 13px;
  font-weight: 600;
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
.meta {
  font-size: 11px;
  color: var(--text-3);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.manage {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
}
.manage:hover {
  text-decoration: underline;
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
.actions {
  display: flex;
  justify-content: flex-end;
}
</style>

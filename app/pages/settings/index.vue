<script setup lang="ts">
const { user, refresh } = useCurrentUser()
if (!user.value) await refresh()

type Entry = {
  to: string
  title: string
  desc: string
  icon: string
  tone: 'accent' | 'graphite' | 'success' | 'danger'
}

const entries = computed<Entry[]>(() => {
  const base: Entry[] = [
    {
      to: '/settings/people',
      title: 'Pessoas e assistente',
      desc: 'Gerencie quem pode delegar, receber follow-ups e seu assistente.',
      icon: 'users',
      tone: 'accent',
    },
    {
      to: '/settings/devices',
      title: 'Dispositivos e passkeys',
      desc: 'Revise dispositivos autorizados e o histórico de aprovações.',
      icon: 'shield-check',
      tone: 'graphite',
    },
    {
      to: '/settings/mcp',
      title: 'Claude e MCP',
      desc: 'Emita tokens para conectar o Claude Code ou o Desktop às suas tarefas.',
      icon: 'plug',
      tone: 'accent',
    },
    {
      to: '/settings/backup',
      title: 'Backup — exportar e importar',
      desc: 'Baixe um JSON com tudo do seu tenant ou restaure a partir de um arquivo.',
      icon: 'database',
      tone: 'success',
    },
  ]
  if (user.value?.role === 'owner') {
    base.push({
      to: '/admin/users',
      title: 'Admin — Usuários',
      desc: 'Lista global do tenant: roles, passkeys e reset de dispositivos.',
      icon: 'shield',
      tone: 'danger',
    })
  }
  return base
})
</script>

<template>
  <div class="settings-hub">
    <PageHero
      title="Configurações"
      description="Ajustes da sua conta Comando — pessoas, segurança e dados do tenant."
    />

    <ul class="cards">
      <li v-for="e in entries" :key="e.to">
        <NuxtLink :to="e.to" class="card">
          <span class="card-icon" :class="e.tone">
            <BaseIcon :name="e.icon" :size="20" />
          </span>
          <span class="card-text">
            <span class="card-title">{{ e.title }}</span>
            <span class="card-desc">{{ e.desc }}</span>
          </span>
          <BaseIcon name="chevron-right" :size="18" class="card-chev" />
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.settings-hub {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 24px 26px 60px;
  max-width: 960px;
  margin: 0 auto;
}

.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.card {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 100%;
  padding: 18px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: inherit;
  transition:
    transform var(--dur-fast) var(--ease-spring),
    border-color var(--dur-fast) var(--ease-spring),
    box-shadow var(--dur-fast) var(--ease-spring);
}
.card:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-card-hover);
}
.card:hover .card-chev {
  transform: translateX(2px);
  color: var(--text-2);
}

.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.card-icon.accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.card-icon.graphite {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}
.card-icon.success {
  background: var(--success-bg);
  color: var(--success);
}
.card-icon.danger {
  background: var(--danger-bg);
  color: var(--danger);
}

.card-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.card-title {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
}
.card-desc {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-3);
}
.card-chev {
  margin-left: auto;
  color: var(--text-4);
  flex-shrink: 0;
  transition:
    transform var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
}

@media (max-width: 680px) {
  .settings-hub {
    padding: 18px 16px 80px;
  }
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>

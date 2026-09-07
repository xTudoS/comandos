<script setup lang="ts">
// Indicador de sincronização offline: chip flutuante (aparece quando há itens
// pendentes ou sincronizando) + painel com a lista do que falta sincronizar.
import { useSyncStatus, entityLabel, operationLabel } from '~/composables/useSyncStatus'
import { useAppUpdate } from '~/composables/useAppUpdate'

const { pending, count, hasPending, isSyncing, online, panelOpen, syncNow } = useSyncStatus()
const { updating, hasUpdate, updateApp, startUpdatePolling } = useAppUpdate()

// Monitora novas versões publicadas (compara o buildId com /_nuxt/builds/latest.json).
startUpdatePolling()

// Chip visível quando há trabalho pendente, sincronização em curso ou uma
// nova versão do app disponível.
const chipVisible = computed(() => hasPending.value || isSyncing.value || hasUpdate.value)
// Sem pendências de sync, mas com versão nova: chip vira convite para atualizar.
const updateOnly = computed(() => hasUpdate.value && !hasPending.value && !isSyncing.value)

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- Chip flutuante -->
    <Transition name="sync-chip">
      <button
        v-if="chipVisible"
        type="button"
        class="sync-chip"
        :class="{ syncing: isSyncing, update: updateOnly }"
        @click="updateOnly ? updateApp() : (panelOpen = true)"
      >
        <span v-if="isSyncing" class="sync-spinner" aria-hidden="true" />
        <BaseIcon v-else-if="updateOnly" name="download" :size="14" />
        <BaseIcon v-else name="cloud-off" :size="14" />
        <span v-if="updateOnly">{{ updating ? 'Atualizando…' : 'Atualização disponível' }}</span>
        <span v-else>{{ isSyncing ? 'Sincronizando…' : `${count} pendente${count === 1 ? '' : 's'}` }}</span>
      </button>
    </Transition>
  </Teleport>

  <!-- Painel de detalhes -->
  <AppSheet v-model:open="panelOpen">
    <div class="sync-panel">
      <header class="sync-head">
        <div class="sync-head-title">
          <span class="sync-head-ico" :class="{ ok: !hasPending }">
            <BaseIcon :name="hasPending ? 'refresh-cw' : 'check'" :size="16" />
          </span>
          <h2>Sincronização</h2>
        </div>
        <button type="button" class="sync-close" aria-label="Fechar" @click="panelOpen = false">
          <BaseIcon name="x" :size="18" />
        </button>
      </header>

      <p class="sync-state">
        <template v-if="!online">
          <BaseIcon name="cloud-off" :size="14" /> Offline — alterações serão enviadas ao reconectar.
        </template>
        <template v-else-if="isSyncing">
          <span class="sync-spinner dark" aria-hidden="true" /> Sincronizando…
        </template>
        <template v-else-if="hasPending">
          <BaseIcon name="clock" :size="14" /> {{ count }} alteraç{{ count === 1 ? 'ão' : 'ões' }} aguardando envio.
        </template>
        <template v-else>
          <BaseIcon name="check" :size="14" class="ok-ico" /> Tudo sincronizado.
        </template>
      </p>

      <ul v-if="hasPending" class="sync-list">
        <li v-for="item in pending" :key="item.id" class="sync-item">
          <span class="sync-op" :class="item.operation.toLowerCase()">{{ operationLabel(item.operation) }}</span>
          <span class="sync-item-main">
            <span class="sync-entity">{{ entityLabel(item.entity) }}</span>
            <span class="sync-when">{{ formatTime(item.timestamp) }}</span>
          </span>
        </li>
      </ul>

      <div v-else class="sync-empty">
        <BaseIcon name="cloud-check" :size="28" />
        <span>Nada na fila</span>
      </div>

      <footer class="sync-foot">
        <button
          type="button"
          class="btn primary"
          :disabled="!online || isSyncing || !hasPending"
          @click="syncNow"
        >
          {{ isSyncing ? 'Sincronizando…' : 'Sincronizar agora' }}
        </button>
        <button
          type="button"
          class="btn ghost sync-update"
          :class="{ available: hasUpdate }"
          :disabled="!online || updating"
          @click="updateApp"
        >
          <BaseIcon name="download" :size="15" />
          {{ updating ? 'Atualizando…' : hasUpdate ? 'Nova versão disponível — atualizar' : 'Atualizar versão do app' }}
        </button>
        <p class="sync-update-hint">
          {{ hasUpdate ? 'Uma versão mais recente foi publicada.' : 'Busca a última versão publicada e recarrega.' }}
        </p>
      </footer>
    </div>
  </AppSheet>
</template>

<style scoped>
/* Chip */
.sync-chip {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 9997;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-fg);
  background: #1f2937;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.sync-chip.syncing {
  background: var(--accent);
}
.sync-chip.update {
  background: var(--accent);
}
@media (max-width: 880px) {
  .sync-chip {
    bottom: calc(72px + env(safe-area-inset-bottom));
  }
}

.sync-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: var(--accent-fg);
  animation: sync-spin 0.7s linear infinite;
}
.sync-spinner.dark {
  border-color: rgba(0, 0, 0, 0.15);
  border-top-color: var(--accent);
}
@keyframes sync-spin {
  to {
    transform: rotate(360deg);
  }
}

.sync-chip-enter-active,
.sync-chip-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.sync-chip-enter-from,
.sync-chip-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Panel */
.sync-panel {
  display: flex;
  flex-direction: column;
  width: min(92vw, 440px);
  max-height: 86vh;
}
.sync-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 8px;
}
.sync-head-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sync-head-title h2 {
  font-size: 17px;
  font-weight: 650;
  margin: 0;
  color: var(--text);
}
.sync-head-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}
.sync-head-ico.ok {
  background: var(--success-bg);
  color: var(--success);
}
.sync-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--surface-hover);
  color: var(--text-2);
  cursor: pointer;
}
.sync-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-3);
  margin: 0;
  padding: 4px 18px 12px;
}
.sync-state .ok-ico {
  color: var(--success);
}

.sync-list {
  list-style: none;
  margin: 0;
  padding: 0 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sync-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.sync-op {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}
.sync-op.create {
  background: var(--success-bg);
  color: var(--success);
}
.sync-op.update {
  background: var(--accent-soft);
  color: var(--accent);
}
.sync-op.delete {
  background: var(--danger-bg);
  color: var(--danger);
}
.sync-item-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.sync-entity {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.sync-when {
  font-size: 12px;
  color: var(--text-4);
}

.sync-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 0;
  color: var(--text-4);
  font-size: 13px;
}

.sync-foot {
  padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  margin-top: 8px;
}
.sync-foot .btn.primary {
  width: 100%;
}
.sync-update {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
}
.sync-update.available {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.sync-update-hint {
  font-size: 12px;
  color: var(--text-4);
  text-align: center;
  margin: 6px 0 0;
}
</style>

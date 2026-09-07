<script setup lang="ts">
import type { TimelineEntry } from '~/composables/useTaskTimeline'

const props = defineProps<{ taskId: string }>()
const taskIdRef = computed(() => props.taskId)
const { entries, loading, error } = useTaskTimeline(taskIdRef)

type ChangeDiff = { from?: unknown; to?: unknown }

function asDiff(v: unknown): ChangeDiff | null {
  if (v && typeof v === 'object' && ('from' in v || 'to' in v)) {
    return v as ChangeDiff
  }
  return null
}

function describe(e: TimelineEntry): string {
  const changes = (e.changes ?? {}) as Record<string, unknown>
  const context = (e.context ?? {}) as Record<string, unknown>

  if (e.entityType === 'task') {
    if (e.action === 'create') return 'criou a tarefa'
    if (e.action === 'complete' || ('done' in changes && asDiff(changes.done))) {
      const d = asDiff(changes.done)
      return d?.to ? 'concluiu a tarefa' : 'reabriu a tarefa'
    }
    if ('delegatePersonId' in changes) {
      const from = context.from_delegate ?? asDiff(changes.delegatePersonId)?.from
      const to = context.to_delegate ?? asDiff(changes.delegatePersonId)?.to
      if (!to) return 'removeu delegação'
      if (!from) return 'delegou a tarefa'
      return 'reatribuiu a tarefa'
    }
    if ('horizon' in changes) {
      const d = asDiff(changes.horizon)
      if (d) return `moveu de ${d.from ?? '—'} para ${d.to ?? '—'}`
      return 'moveu de horizonte'
    }
    if ('scheduledDate' in changes) {
      const d = asDiff(changes.scheduledDate)
      if (d) return `reagendou de ${d.from ?? 'sem data'} para ${d.to ?? 'sem data'}`
      return 'reagendou'
    }
    if ('followupActive' in changes) {
      const d = asDiff(changes.followupActive)
      return d?.to ? 'ativou follow-up' : 'desativou follow-up'
    }
    if ('archived' in changes) {
      const d = asDiff(changes.archived)
      return d?.to ? 'arquivou a tarefa' : 'desarquivou a tarefa'
    }
    if ('title' in changes) return 'editou o título'
    if ('description' in changes) return 'editou a descrição'
    if (e.action === 'update') return 'atualizou a tarefa'
    if (e.action === 'delete') return 'excluiu a tarefa'
  }

  if (e.entityType === 'checklist_item') {
    if (e.action === 'create') return 'adicionou item ao checklist'
    if (e.action === 'delete') return 'removeu item do checklist'
    if ('done' in changes) {
      const d = asDiff(changes.done)
      return d?.to ? 'marcou item do checklist' : 'desmarcou item do checklist'
    }
    if ('text' in changes) return 'editou item do checklist'
    return 'mexeu no checklist'
  }

  if (e.entityType === 'task_annotation') {
    if (e.action === 'create') return 'adicionou anotação'
    if (e.action === 'delete') return 'removeu anotação'
    return 'editou anotação'
  }

  return `${e.entityType} · ${e.action}`
}

type Group = { key: string; at: string; actor: string | null; items: TimelineEntry[] }

const grouped = computed<Group[]>(() => {
  const out: Group[] = []
  for (const e of entries.value) {
    const hour = e.at.slice(0, 13)
    const actor = e.actorUserId
    const last = out.at(-1)
    if (last && last.actor === actor && last.at.slice(0, 13) === hour) {
      last.items.push(e)
    } else {
      out.push({ key: `${actor}:${hour}:${e.id}`, at: e.at, actor, items: [e] })
    }
  }
  return out.reverse()
})

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="timeline">
    <div v-if="loading && entries.length === 0" class="state">Carregando…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="entries.length === 0" class="state">Sem histórico ainda.</div>

    <ol v-else class="groups">
      <li v-for="g in grouped" :key="g.key" class="group">
        <div class="when">{{ fmtWhen(g.at) }}</div>
        <div class="who">{{ g.items[0]?.actorName ?? 'Sistema' }}</div>
        <ul class="events">
          <li v-for="e in g.items" :key="e.id" class="event">
            {{ describe(e) }}
          </li>
        </ul>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.groups {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 380px;
  overflow-y: auto;
}
.group {
  border-left: 2px solid var(--accent);
  padding-left: 12px;
}
.when {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.who {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.events {
  list-style: disc;
  padding-left: 16px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.event {
  font-size: 13px;
  color: var(--text-2);
}
.state {
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  padding: 8px;
  font-style: italic;
}
.state.error {
  color: var(--danger);
}
</style>

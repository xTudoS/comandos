<script setup lang="ts">
// Card "plan-style" de uma meta — extraído de metas.vue para ser reutilizado
// por todas as views (Grade, Board, Calendário, Timeline). Progresso e status
// vêm da store (fonte única); o pai passa status/destaque já calculados.
import type { Meta, StatusMeta } from '~/types/meta'
import { useMetasStore } from '~/stores/metas'
import { diasAtePrazo } from '~/composables/useStatus'

const props = defineProps<{
  meta: Meta
  status: StatusMeta
  destaque?: boolean
  /** Variante compacta (board/calendário): esconde descrição e stats longos. */
  compact?: boolean
}>()
const emit = defineEmits<{
  edit: [Meta]
  arquivar: [Meta]
  deletar: [Meta]
}>()

const metasStore = useMetasStore()
const progresso = computed(() => metasStore.progressoMeta(props.meta.id))

const STATUS_PILL: Record<StatusMeta, string> = {
  vencida: 'Vencida',
  ativa: 'Ativa',
  concluida: 'Concluída',
}

const prazoLabel = computed(() => {
  const m = props.meta
  if (!m.prazo) return 'sem prazo'
  const d = diasAtePrazo(m.prazo)
  if (d === null) return 'sem prazo'
  if (d < 0) return `vencida há ${Math.abs(d)}d`
  if (d === 0) return 'vence hoje'
  if (d === 1) return 'vence amanhã'
  if (d <= 60) return `vence em ${d}d`
  const [, mo, da] = m.prazo.split('-')
  return `${da}/${mo}`
})
</script>

<template>
  <article
    class="plan-card is-clickable"
    :class="[`st-${status}`, { destaque, compact }]"
    role="button"
    tabindex="0"
    @click="emit('edit', meta)"
    @keydown.enter.self="emit('edit', meta)"
  >
    <div v-if="destaque" class="plan-flag">Destaque</div>
    <header class="plan-head">
      <h3 class="plan-title">{{ meta.titulo }}</h3>
      <span class="plan-status" :class="`st-${status}`">{{ STATUS_PILL[status] }}</span>
    </header>
    <p v-if="meta.descricao && !compact" class="plan-desc">{{ meta.descricao }}</p>

    <div class="plan-pct-row">
      <span class="plan-pct">{{ progresso.pct }}<span class="plan-pct-sign">%</span></span>
      <span class="plan-prazo" :class="{ over: status === 'vencida' }">
        <BaseIcon name="calendar" :size="13" />
        {{ prazoLabel }}
      </span>
    </div>

    <div class="plan-progress">
      <span :style="{ width: progresso.pct + '%' }" />
    </div>

    <ul v-if="!compact" class="plan-stats">
      <li>
        <BaseIcon name="check-check" :size="14" />
        {{ progresso.feitas }}/{{ progresso.total }} ações
      </li>
      <li>
        <BaseIcon name="square-check-big" :size="14" />
        {{ progresso.tarefasFeitas }}/{{ progresso.totalT }} tarefas
      </li>
      <li>
        <BaseIcon name="folder" :size="14" />
        {{ progresso.projetosFeitos }}/{{ progresso.totalP }} projetos
      </li>
    </ul>

    <footer class="plan-foot" @click.stop>
      <button type="button" class="plan-act" aria-label="Editar" title="Editar" @click="emit('edit', meta)">
        <BaseIcon name="pencil" :size="15" />
      </button>
      <button type="button" class="plan-act" aria-label="Arquivar" title="Arquivar" @click="emit('arquivar', meta)">
        <BaseIcon name="archive" :size="15" />
      </button>
      <button type="button" class="plan-act danger" aria-label="Apagar" title="Apagar" @click="emit('deletar', meta)">
        <BaseIcon name="trash-2" :size="15" />
      </button>
    </footer>
  </article>
</template>

<style scoped>
.plan-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 20px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: box-shadow var(--dur-base) var(--ease-spring),
              transform var(--dur-base) var(--ease-spring);
}
.plan-card:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-2px);
}
.plan-card.compact {
  padding: 14px;
  gap: 10px;
  border-radius: var(--radius-lg);
}
.plan-card.is-clickable {
  cursor: pointer;
}
.plan-card.is-clickable:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}
.plan-card.destaque {
  border: 1.5px solid transparent;
  background:
    linear-gradient(var(--surface), var(--surface)) padding-box,
    linear-gradient(135deg, #0a84ff, #bf5af2 55%, #ff9f0a) border-box;
  box-shadow: var(--shadow-card-hover);
}
.plan-flag {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--accent-fg);
  background: linear-gradient(135deg, #0a84ff, #bf5af2);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.plan-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-right: 64px;
}
.compact .plan-head { padding-right: 0; }
.plan-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  line-height: 1.3;
}
.compact .plan-title { font-size: 14px; }
.plan-status {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.plan-status.st-ativa { background: var(--accent-soft); color: var(--accent); }
.plan-status.st-vencida { background: var(--danger-bg); color: var(--danger); }
.plan-status.st-concluida { background: var(--success-bg); color: var(--success); }
.plan-card.destaque .plan-head { padding-right: 0; }
.plan-card.destaque .plan-status { display: none; }
.plan-desc {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plan-pct-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}
.plan-pct {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.compact .plan-pct { font-size: 22px; }
.plan-pct-sign { font-size: 16px; font-weight: 600; color: var(--text-3); margin-left: 1px; }
.plan-prazo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.plan-prazo.over { color: var(--danger); font-weight: 600; }
.plan-progress {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-hover);
  overflow: hidden;
}
.plan-progress > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent);
  transition: width var(--dur-base) var(--ease-spring);
}
.st-concluida .plan-progress > span { background: var(--success); }
.st-vencida .plan-progress > span { background: var(--danger); }
.plan-stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plan-stats li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.plan-stats li :deep(svg) { color: var(--text-4); flex-shrink: 0; }
.plan-foot {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  padding-top: 10px;
  margin-top: 2px;
  border-top: 1px solid var(--border-faint);
}
.compact .plan-foot { padding-top: 8px; }
.plan-act {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  transition: background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring);
}
.plan-act:hover { background: var(--surface-hover); color: var(--text); }
.plan-act.danger:hover { background: var(--danger-bg); color: var(--danger); }
</style>

<script setup lang="ts">
import type { AgendaItem } from '~~/shared/agendaItem'
import { isAgendaItemOverdue } from '~/utils/overdue'
import { formatBRL } from '~/utils/money'

// Card de item da agenda — fonte única de verdade da linguagem visual, agora
// para TODOS os tipos (tarefa, follow-up, meta, projeto, pagamento) e não só
// para tarefa. Era o acoplamento a `task` aqui dentro que obrigou `/metas` a
// duplicar calendário e timeline em componentes próprios.
//  • variant="block": cards ricos da grade dia/semana — chip de ícone
//    preenchido, título colorido no tom, hora suave, rodapé com avatares.
//    Layout sensível à altura (compacto → rico).
//  • variant="pill": linha compacta da grade do mês: ponto + hora + título.
// Apresentacional: o componente-pai cuida do clique, posicionamento e drag.
const props = withDefaults(
  defineProps<{
    item: AgendaItem
    variant?: 'block' | 'pill'
    /** Altura do bloco em px (block) — define o nível de detalhe. */
    height?: number
    /** Rótulo de período já formatado (block). Cai para item.time. */
    timeLabel?: string
    /** Sobrescreve o subtítulo que já vem resolvido no item. */
    subtitle?: string
  }>(),
  { variant: 'block', height: 0, timeLabel: '', subtitle: '' },
)

// O tom vem pronto no item: quem projeta é que sabe se aquilo é uma tarefa CEO,
// um follow-up, uma meta ou uma saída de caixa.
const tone = computed(() => props.item.tone)

// Atraso é um segundo eixo de informação: a COR já está ocupada pelo tom do
// item, então marcar atraso com cor faria os dois sinais competirem. Usamos
// contorno + ícone, que somam sem disputar. Regra compartilhada com a lista de
// tarefas e com o badge do menu (~/utils/overdue).
const overdue = computed(() => isAgendaItemOverdue(props.item))

// `ceo` já ocupa 'target', então meta usa 'flag' — dois alvos na mesma tela
// seriam indistinguíveis de relance.
const ICON: Record<string, string> = {
  ceo: 'target',
  delegate: 'send',
  personal: 'sprout',
  fup: 'hourglass',
  goal: 'flag',
  project: 'folder',
  'payment-in': 'arrow-down-left',
  'payment-out': 'arrow-up-right',
}
const icon = computed(() => ICON[tone.value] ?? 'circle')

const people = computed(() =>
  props.item.delegatePersonName ? [{ name: props.item.delegatePersonName }] : [],
)

const timeText = computed(() => props.timeLabel || props.item.time || '')

// Um vencimento sem o valor não diz nada — para pagamento, o número É a
// informação principal, e ocupa o lugar da hora (que pagamento não tem).
const amountText = computed(() =>
  props.item.amountCents === null ? '' : formatBRL(props.item.amountCents),
)

const subtitleText = computed(() => props.subtitle || props.item.subtitle || '')

// Níveis por altura: muito curto → uma linha; a partir daí revela chip,
// avatares e subtítulo conforme há espaço vertical.
const compact = computed(() => props.height > 0 && props.height < 52)
const showChip = computed(() => props.height >= 64)
const showFooter = computed(() => people.value.length > 0 && props.height >= 94)
const showSub = computed(() => !!subtitleText.value && props.height >= 140)
</script>

<template>
  <div
    class="evc"
    :class="[variant, tone, { done: item.done, overdue }]"
    :title="overdue ? 'Atrasada' : undefined"
  >
    <!-- BLOCK (grade dia/semana) -->
    <template v-if="variant === 'block'">
      <!-- Compacto: uma linha -->
      <span v-if="compact" class="evc-compact">
        <BaseIcon
          v-if="overdue"
          name="triangle-alert"
          :size="11"
          class="evc-late"
          aria-hidden="true"
        />
        <span v-else class="evc-dot" aria-hidden="true" />
        <span class="evc-ctitle">{{ item.title }}</span>
        <span v-if="timeText || amountText" class="evc-ctime">{{ timeText || amountText }}</span>
      </span>

      <!-- Rico: chip + título + hora (+ subtítulo + avatares) -->
      <span v-else class="evc-rich">
        <span v-if="showChip" class="evc-chip" aria-hidden="true">
          <BaseIcon :name="icon" :size="15" />
        </span>
        <span class="evc-title">{{ item.title }}</span>
        <span v-if="timeText || amountText || overdue" class="evc-time">
          <BaseIcon
            v-if="overdue"
            name="triangle-alert"
            :size="11"
            class="evc-late"
            aria-hidden="true"
          />
          {{ timeText || amountText }}
        </span>
        <span v-if="showSub" class="evc-sub">{{ subtitleText }}</span>
        <span v-if="showFooter" class="evc-footer">
          <AvatarStack :people="people" :size="22" :max="3" />
        </span>
      </span>
    </template>

    <!-- PILL (grade do mês) -->
    <template v-else>
      <BaseIcon
        v-if="overdue"
        name="triangle-alert"
        :size="11"
        class="evc-pill-ico evc-late"
        aria-hidden="true"
      />
      <BaseIcon
        v-else-if="item.kind !== 'task'"
        :name="icon"
        :size="11"
        class="evc-pill-ico"
        aria-hidden="true"
      />
      <span v-else class="evc-dot" aria-hidden="true" />
      <span v-if="item.time" class="evc-pill-time">{{ item.time }}</span>
      <span class="evc-pill-title">{{ item.title }}</span>
      <span v-if="amountText" class="evc-pill-amount">{{ amountText }}</span>
    </template>

    <span v-if="overdue" class="sr-only">Atrasada</span>
  </div>
</template>

<style scoped>
/* Tom por tipo — define as variáveis usadas pelas duas variantes. */
.evc.ceo {
  --evc-fg: var(--ceo-fg);
  --evc-bg: var(--ceo-bg);
}
.evc.delegate {
  --evc-fg: var(--delego-fg);
  --evc-bg: var(--delego-bg);
}
.evc.personal {
  --evc-fg: var(--pessoal-fg);
  --evc-bg: var(--pessoal-bg);
}
.evc.fup {
  --evc-fg: var(--followup-fg);
  --evc-bg: var(--followup-bg);
}

/* Tons dos tipos que entraram com a agenda multi-entidade.
   Meta e projeto reusam os tokens que as próprias telas já usam; pagamento
   reusa a linguagem financeira do app (entrada verde, saída âmbar). A cor de
   entrada/saída ecoa delegado/pessoal — o ícone (seta para dentro/fora) e o
   valor no lugar da hora é que separam os dois de relance.
   O fundo é derivado do tom com color-mix em vez de um hex novo: a contagem de
   literais de cor por arquivo só pode encolher (design-system/MASTER.md §5). */
.evc.goal {
  --evc-fg: var(--meta-from);
  --evc-bg: color-mix(in srgb, var(--meta-from) 10%, var(--surface));
}
.evc.project {
  --evc-fg: var(--proj-empresa-fg);
  --evc-bg: var(--proj-empresa-bg);
}
.evc.payment-in {
  --evc-fg: var(--pag-pago);
  --evc-bg: color-mix(in srgb, var(--pag-pago) 10%, var(--surface));
}
.evc.payment-out {
  --evc-fg: var(--pag-pendente);
  --evc-bg: color-mix(in srgb, var(--pag-pendente) 10%, var(--surface));
}

/* ── BLOCK ─────────────────────────────────────── */
.evc.block {
  position: relative;
  height: 100%;
  width: 100%;
  background: var(--evc-bg);
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--evc-fg) 16%, transparent);
  overflow: hidden;
}

/* Hora suave: tom do tipo dessaturado, mas ainda legível. */
.evc-time,
.evc-ctime {
  color: color-mix(in srgb, var(--evc-fg) 58%, var(--text-3));
  font-variant-numeric: tabular-nums;
}

/* Rico (coluna): chip no topo, título colorido, hora suave, rodapé. */
.evc-rich {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px 10px;
  gap: 1px;
}
.evc-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-bottom: 4px;
  border-radius: 10px;
  background: var(--evc-fg);
  color: var(--accent-fg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
  flex-shrink: 0;
}
.evc-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--evc-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.evc-time {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
}
.evc-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.evc-footer {
  display: flex;
  align-items: center;
  margin-top: auto;
  padding-top: 6px;
}

/* Compacto (uma linha): ponto + título + hora à direita. */
.evc-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 10px;
}
.evc-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--evc-fg);
}
.evc-ctitle {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--evc-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.evc-ctime {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── PILL (grade do mês) ───────────────────────── */
.evc.pill {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 8px;
  border-radius: 6px;
  background: transparent;
  transition: background var(--dur-fast) var(--ease-spring);
}
.evc.pill:hover {
  background: var(--evc-bg);
}
.evc-pill-ico {
  color: var(--evc-fg);
  flex-shrink: 0;
}
.evc-pill-time {
  font-size: 11px;
  font-weight: 600;
  color: var(--evc-fg);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.evc-pill-title {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Valor do pagamento: ocupa o lugar da hora, que pagamento não tem. */
.evc-pill-amount {
  font-size: 11px;
  font-weight: 600;
  color: var(--evc-fg);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* Numa coluna estreita (semana/mês), o valor comia a linha inteira e o título
   sobrava como uma letra só. Entre "R$ 1.200,00" sem saber do quê e
   "Honorários do co…" sem o valor, o título ganha — o valor está a um clique.
   Container query em vez de media query: o que importa é a largura da COLUNA,
   não a da janela. O `container-type` vem do pai (.cal-allday-bar). */
@container (max-width: 190px) {
  .evc-pill-amount {
    display: none;
  }
}

/* ── Estado atrasado ───────────────────────────── */
/* Contorno + ícone em vez de cor de fundo: o fundo já codifica o TIPO da
   tarefa (ceo/delegado/pessoal/follow-up) e trocá-lo apagaria essa informação.
   Assim os dois sinais convivem — a cor continua dizendo "o quê", o contorno
   diz "está atrasada". */
.evc-late {
  color: var(--danger);
  flex-shrink: 0;
}
.evc.block.overdue {
  box-shadow:
    inset 0 0 0 1.5px var(--danger-border),
    inset 3px 0 0 0 var(--danger);
}
.evc.pill.overdue .evc-pill-time {
  color: var(--danger);
}
.evc.pill.overdue .evc-pill-title {
  font-weight: 600;
}

/* Concluída vence atraso: nada concluído é "atrasado", mas se as duas classes
   coincidirem por um frame durante o toggle otimista, o traço some. */
.evc.done.overdue {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--evc-fg) 16%, transparent);
}
.evc.done .evc-late {
  display: none;
}

/* ── Estado concluído ──────────────────────────── */
.evc.done {
  opacity: 0.5;
}
.evc.done .evc-title,
.evc.done .evc-ctitle,
.evc.done .evc-pill-title {
  text-decoration: line-through;
}
</style>

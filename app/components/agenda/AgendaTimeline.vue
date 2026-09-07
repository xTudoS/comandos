<script setup lang="ts">
import type { ActionItem } from '#ui/types'
import type { AgendaItem } from '~~/shared/agendaItem'
import type { AgendaRange, AgendaView } from '~/composables/useAgendaWindow'
import { DOW_SHORT, MESES, addDays, fmtDate, sameDay } from '~/utils/dates'
import { formatBRL } from '~/utils/money'

/**
 * Gantt horizontal. Componente BURRO: recebe itens já projetados e emite
 * intenções. Não conhece mais tarefa, empresa nem projeto — era esse
 * acoplamento que obrigava `/metas` a manter uma timeline própria.
 */
const props = defineProps<{
  range: AgendaRange
  items: AgendaItem[]
  view: AgendaView
}>()

const emit = defineEmits<{
  open: [item: AgendaItem]
  /** Alternar concluído. O pai sabe o que "concluir" significa por tipo. */
  toggleDone: [item: AgendaItem]
}>()

// ── Geometria por modo ───────────────────────────────────
const PX_PER_DAY: Record<AgendaView, number> = { day: 560, week: 156, month: 58 }
const MIN_CARD_W: Record<AgendaView, number> = { day: 240, week: 184, month: 168 }
const ROW_H = 62
const CARD_H = 52
const TOP_PAD = 16
const LANE_GAP = 10

// Zoom contínuo de densidade horizontal: multiplica a largura por dia. Comprimir
// (zoom-out) mostra MAIS dias/dados na tela; expandir (zoom-in) dá mais detalhe.
// É independente do modo dia/semana/mês — cada modo só define a largura-base.
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.4
const zoom = ref(1)
const clampZoom = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))
const pxPerDay = computed(() => PX_PER_DAY[props.view] * zoom.value)
const canvasW = computed(() => props.range.days * pxPerDay.value)

const today = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

const days = computed(() =>
  Array.from({ length: props.range.days }, (_, i) => {
    const d = addDays(props.range.start, i)
    const dow = d.getDay()
    return {
      i,
      key: fmtDate(d),
      date: d,
      dow: DOW_SHORT[dow]!,
      dnum: String(d.getDate()),
      month: d.getMonth(),
      year: d.getFullYear(),
      isToday: sameDay(d, today),
      isWeekend: dow === 0 || dow === 6,
    }
  }),
)

// Agrupa colunas consecutivas do mesmo mês para o cabeçalho superior.
const monthGroups = computed(() => {
  const groups: { label: string; left: number; width: number }[] = []
  for (const d of days.value) {
    const last = groups[groups.length - 1]
    if (last && last.label === `${MESES[d.month]} ${d.year}`) {
      last.width += pxPerDay.value
    } else {
      groups.push({
        label: `${MESES[d.month]} ${d.year}`,
        left: d.i * pxPerDay.value,
        width: pxPerDay.value,
      })
    }
  }
  return groups
})

// ── Posicionamento + empacotamento em faixas (lanes) ─────
type Placed = {
  item: AgendaItem
  left: number
  width: number
  top: number
}

/** Minutos do dia a partir de `HH:MM`. */
function minutesOf(time: string | null): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h! * 60 + m!
}

function dayIndexOf(date: string): number {
  return Math.round(
    (new Date(`${date}T00:00:00`).getTime() - props.range.start.getTime()) / 86_400_000,
  )
}

const placed = computed<Placed[]>(() => {
  const items = props.items.map((item) => {
    const startMin = minutesOf(item.time)
    // Item de dia todo começa na borda do dia. Antes usava 6% do dia — um
    // recuo arbitrário que o fazia parecer agendado para ~01:26.
    const frac = startMin === null ? 0 : startMin / 1440
    const left = dayIndexOf(item.date) * pxPerDay.value + frac * pxPerDay.value

    // Faixa multi-dia usa a largura REAL e ignora o mínimo: forçar 168–240px
    // numa barra de duas semanas a faria mentir sobre a própria duração. Só
    // bloco pontual ganha largura mínima, que ali é legibilidade, não duração.
    const endMin = minutesOf(item.endTime)
    const spanDays = dayIndexOf(item.endDate) - dayIndexOf(item.date)
    const durDays =
      spanDays > 0
        ? spanDays + (endMin === null ? 1 : endMin / 1440)
        : endMin !== null && startMin !== null && endMin > startMin
          ? (endMin - startMin) / 1440
          : 60 / 1440
    const natural = durDays * pxPerDay.value
    let width = item.shape === 'span' || spanDays > 0 ? natural : Math.max(MIN_CARD_W[props.view], natural)
    width = Math.min(width, canvasW.value - left - 6)
    width = Math.max(width, 120)
    return { item, left, width }
  })
  items.sort((a, b) => a.left - b.left)

  const laneEnds: number[] = []
  const out: Placed[] = []
  for (const it of items) {
    let lane = laneEnds.findIndex((end) => end <= it.left - LANE_GAP)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = it.left + it.width
    out.push({ ...it, top: TOP_PAD + lane * ROW_H })
  }
  return out
})

const laneCount = computed(() =>
  placed.value.reduce((max, p) => Math.max(max, (p.top - TOP_PAD) / ROW_H + 1), 0),
)
const bodyHeight = computed(() =>
  Math.max(260, TOP_PAD * 2 + Math.ceil(laneCount.value) * ROW_H),
)

// ── Linha "agora" ────────────────────────────────────────
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined
const nowLeft = computed(() => {
  const diffMs = now.value.getTime() - props.range.start.getTime()
  const idx = diffMs / 86_400_000
  return idx * pxPerDay.value
})
const nowVisible = computed(
  () => nowLeft.value >= 0 && nowLeft.value <= canvasW.value,
)
const nowLabel = computed(
  () =>
    `${String(now.value.getHours()).padStart(2, '0')}:${String(now.value.getMinutes()).padStart(2, '0')}`,
)

// ── Auto-scroll p/ trazer "agora" à vista ────────────────
const scrollEl = ref<HTMLElement>()
function centerNow() {
  const el = scrollEl.value
  if (!el) return
  const target = nowVisible.value ? Math.max(0, nowLeft.value - 160) : 0
  el.scrollLeft = target
}
onMounted(() => {
  centerNow()
  clock = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  cancelAnimationFrame(zoomRAF)
})
// Ao trocar modo/janela, volta ao zoom-base daquele modo e recentraliza.
watch([() => props.view, () => props.range.from], () => {
  zoom.value = 1
  void nextTick(centerNow)
})

// ── Zoom horizontal (mostra mais/menos dados), ancorado no cursor ─────────────
// Mantém o dia sob o cursor (ou o centro visível) parado enquanto escala, como
// um zoom de mapa — daí a sensação natural. canvasW = days · base · zoom.
function zoomAt(nextZoom: number, anchorClientX?: number) {
  const el = scrollEl.value
  const clamped = clampZoom(nextZoom)
  if (!el) {
    zoom.value = clamped
    return
  }
  const rect = el.getBoundingClientRect()
  const anchorX = (anchorClientX ?? rect.left + el.clientWidth / 2) - rect.left
  const baseW = props.range.days * PX_PER_DAY[props.view]
  const ratio = (el.scrollLeft + anchorX) / (baseW * zoom.value)
  zoom.value = clamped
  void nextTick(() => {
    el.scrollLeft = ratio * baseW * clamped - anchorX
  })
}

// Pinch no trackpad / ctrl+roda: contínuo e proporcional à intensidade.
function onWheelZoom(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  zoomAt(zoom.value * Math.exp(-e.deltaY * 0.0016), e.clientX)
}

// Botões (− / +): tween curto com easeOut, ancorado no centro visível.
let zoomRAF = 0
function animateZoom(target: number) {
  cancelAnimationFrame(zoomRAF)
  const el = scrollEl.value
  const from = zoom.value
  const to = clampZoom(target)
  if (from === to) return
  const anchorX = el ? el.clientWidth / 2 : 0
  const baseW = props.range.days * PX_PER_DAY[props.view]
  const ratio = el ? (el.scrollLeft + anchorX) / (baseW * from) : 0
  const start = performance.now()
  const DUR = 220
  const tick = (t: number) => {
    const p = Math.min(1, (t - start) / DUR)
    const eased = 1 - Math.pow(1 - p, 3)
    zoom.value = from + (to - from) * eased
    if (el) el.scrollLeft = ratio * baseW * zoom.value - anchorX
    if (p < 1) zoomRAF = requestAnimationFrame(tick)
  }
  zoomRAF = requestAnimationFrame(tick)
}
const ZOOM_STEP = 1.25
function compactDays() {
  animateZoom(zoom.value / ZOOM_STEP) // zoom-out → mais dados
}
function expandDays() {
  animateZoom(zoom.value * ZOOM_STEP) // zoom-in → mais detalhe
}

// ── Conteúdo dos cards ───────────────────────────────────
// Ícones Lucide por tom (spec §3.1: nada de emoji estrutural). `ceo` já usa
// 'target', então meta vira 'flag'.
const TONE_ICON: Record<string, string> = {
  ceo: 'target',
  delegate: 'send',
  personal: 'sprout',
  fup: 'hourglass',
  goal: 'flag',
  project: 'folder',
  'payment-in': 'arrow-down-left',
  'payment-out': 'arrow-up-right',
}

const TONE_FALLBACK: Record<string, string> = {
  ceo: 'CEO',
  delegate: 'Delegado',
  personal: 'Pessoal',
  fup: 'Follow-up',
  goal: 'Meta',
  project: 'Projeto',
  'payment-in': 'Entrada',
  'payment-out': 'Saída',
}

function iconFor(item: AgendaItem): string {
  return TONE_ICON[item.tone] ?? 'dot'
}
function subtitleFor(item: AgendaItem) {
  // O subtítulo já vem resolvido na projeção; aqui só entra o rótulo genérico
  // quando não há projeto, empresa nem pessoa para mostrar.
  return item.subtitle ?? TONE_FALLBACK[item.tone] ?? ''
}

/** Só tarefa tem "concluir" no menu; meta e pagamento se resolvem na tela deles. */
function menuFor(item: AgendaItem): ActionItem[] {
  const open: ActionItem = { key: 'edit', label: 'Abrir', icon: 'pencil' }
  if (item.entityType !== 'task') return [open]
  return [open, { key: 'done', label: item.done ? 'Reabrir' : 'Concluir', icon: 'check' }]
}

function onMenu(key: string, item: AgendaItem) {
  if (key === 'edit') emit('open', item)
  else if (key === 'done') emit('toggleDone', item)
}
</script>

<template>
  <div class="timeline">
    <!-- Zoom de densidade horizontal (alternativa acessível ao pinch) -->
    <div class="tl-zoombar" role="group" aria-label="Densidade da timeline">
      <button
        type="button"
        class="tl-zoom-btn"
        aria-label="Compactar (ver mais dias)"
        :disabled="zoom <= ZOOM_MIN + 0.01"
        @click="compactDays"
      >
        <BaseIcon name="minus" :size="16" />
      </button>
      <BaseIcon name="zoom-in" :size="14" class="tl-zoom-ico" aria-hidden="true" />
      <button
        type="button"
        class="tl-zoom-btn"
        aria-label="Expandir (mais detalhe)"
        :disabled="zoom >= ZOOM_MAX - 0.01"
        @click="expandDays"
      >
        <BaseIcon name="plus" :size="16" />
      </button>
    </div>

    <div ref="scrollEl" class="tl-scroll" @wheel="onWheelZoom">
      <div class="tl-canvas" :style="{ width: `${canvasW}px` }">
        <!-- Month group header -->
        <div class="tl-months">
          <div
            v-for="g in monthGroups"
            :key="g.label"
            class="tl-month"
            :style="{ left: `${g.left}px`, width: `${g.width}px` }"
          >
            {{ g.label }}
          </div>
        </div>

        <!-- Day header -->
        <div class="tl-days">
          <div
            v-for="d in days"
            :key="d.key"
            class="tl-day"
            :class="{ today: d.isToday, weekend: d.isWeekend }"
            :style="{ left: `${d.i * pxPerDay}px`, width: `${pxPerDay}px` }"
          >
            <span class="tl-dow">{{ d.dow }}</span>
            <span class="tl-dnum">{{ d.dnum }}</span>
          </div>
        </div>

        <!-- Body -->
        <div class="tl-body" :style="{ height: `${bodyHeight}px` }">
          <!-- Column grid -->
          <div
            v-for="d in days"
            :key="d.key"
            class="tl-col"
            :class="{ today: d.isToday, weekend: d.isWeekend }"
            :style="{ left: `${d.i * pxPerDay}px`, width: `${pxPerDay}px` }"
          />

          <!-- Now indicator -->
          <div v-if="nowVisible" class="tl-now" :style="{ left: `${nowLeft}px` }">
            <span class="tl-now-handle">{{ nowLabel }}</span>
            <span class="tl-now-line" />
          </div>

          <!-- Cards -->
          <button
            v-for="p in placed"
            :key="p.item.id"
            type="button"
            class="tl-card"
            :class="[p.item.tone, { done: p.item.done }]"
            :style="{
              left: `${p.left}px`,
              top: `${p.top}px`,
              width: `${p.width}px`,
              height: `${CARD_H}px`,
            }"
            @click="emit('open', p.item)"
          >
            <span class="tl-rail" />
            <span class="tl-card-main">
              <span class="tl-title">{{ p.item.title }}</span>
              <span class="tl-sub">
                <BaseIcon class="tl-emoji" :name="iconFor(p.item)" :size="13" aria-hidden="true" />
                <span class="tl-sub-text">{{ subtitleFor(p.item) }}</span>
              </span>
            </span>
            <span class="tl-trailing" @click.stop>
              <span v-if="p.item.time" class="tl-time">{{ p.item.time }}</span>
              <span v-else-if="p.item.amountCents !== null" class="tl-time">
                {{ formatBRL(p.item.amountCents) }}
              </span>
              <AvatarStack
                v-if="p.item.delegatePersonName"
                :people="[{ name: p.item.delegatePersonName }]"
                :size="22"
                :max="3"
              />
              <BaseActionMenu
                :items="menuFor(p.item)"
                size="sm"
                @select="(k) => onMenu(k, p.item)"
              />
            </span>
          </button>

          <!-- Empty state -->
          <div v-if="!placed.length" class="tl-empty">
            <BaseIcon name="calendar-x" :size="22" />
            <span>Nenhum compromisso nesta janela.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  position: relative;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.tl-scroll {
  overflow: auto;
  max-height: min(72vh, 760px);
  scrollbar-gutter: stable;
}

/* ── Controle de zoom (densidade) flutuante ───── */
.tl-zoombar {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-glass-strong);
  backdrop-filter: saturate(180%) blur(8px);
  box-shadow: var(--shadow-sm);
}
.tl-zoom-btn {
  width: 28px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.tl-zoom-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.tl-zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tl-zoom-ico {
  color: var(--text-3);
  margin: 0 1px;
}
.tl-canvas {
  position: relative;
  min-width: 100%;
}

/* ── Month header ─────────────────────────────── */
.tl-months {
  position: sticky;
  top: 0;
  z-index: 6;
  height: 34px;
  background: var(--surface);
  border-bottom: 1px solid var(--border-faint);
}
.tl-month {
  position: absolute;
  top: 0;
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  text-transform: capitalize;
  border-left: 1px solid var(--border);
  white-space: nowrap;
}
.tl-month:first-child {
  border-left: none;
}

/* ── Day header ───────────────────────────────── */
.tl-days {
  position: sticky;
  top: 34px;
  z-index: 5;
  height: 46px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.tl-day {
  position: absolute;
  top: 0;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 10px;
  border-left: 1px solid var(--border-faint);
}
.tl-day .tl-dow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
}
.tl-day.weekend .tl-dow {
  color: var(--text-4);
}
.tl-day .tl-dnum {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.tl-day.today .tl-dow {
  color: var(--accent);
}
.tl-day.today .tl-dnum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
}

/* ── Body ─────────────────────────────────────── */
.tl-body {
  position: relative;
  /* diagonal hatch like the reference */
  background-image: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--text) 2%, transparent) 0,
    color-mix(in srgb, var(--text) 2%, transparent) 1px,
    transparent 1px,
    transparent 9px
  );
}
.tl-col {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--border-faint);
}
.tl-col.today {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
.tl-col.weekend {
  background: color-mix(in srgb, var(--text) 1.5%, transparent);
}

/* ── Now indicator ────────────────────────────── */
.tl-now {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 4;
  pointer-events: none;
}
.tl-now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: var(--color-h-micro);
}
.tl-now-handle {
  position: absolute;
  top: 4px;
  left: 0;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent-fg);
  background: var(--color-h-micro);
  padding: 2px 6px;
  border-radius: 999px;
  white-space: nowrap;
}

/* ── Cards ────────────────────────────────────── */
.tl-card {
  position: absolute;
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  overflow: hidden;
  z-index: 1;
  transition: transform var(--dur-fast) var(--ease-spring),
    box-shadow var(--dur-fast) var(--ease-spring);
}
.tl-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  z-index: 5;
}
.tl-rail {
  width: 4px;
  flex-shrink: 0;
  background: var(--accent);
}
.tl-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 0 8px 0 12px;
}
.tl-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tl-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
  min-width: 0;
}
.tl-emoji {
  flex: 0 0 auto;
  color: currentColor;
}
.tl-sub-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-trailing {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 8px;
  flex-shrink: 0;
}
.tl-time {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* Type tints (left rail + soft surface) */
.tl-card.ceo {
  background: color-mix(in srgb, var(--ceo-bg) 60%, var(--surface));
}
.tl-card.ceo .tl-rail {
  background: var(--ceo-fg);
}
.tl-card.delegate {
  background: color-mix(in srgb, var(--delego-bg) 60%, var(--surface));
}
.tl-card.delegate .tl-rail {
  background: var(--delego-fg);
}
.tl-card.personal {
  background: color-mix(in srgb, var(--pessoal-bg) 60%, var(--surface));
}
.tl-card.personal .tl-rail {
  background: var(--pessoal-fg);
}
.tl-card.fup {
  background: color-mix(in srgb, var(--followup-bg) 60%, var(--surface));
}
.tl-card.fup .tl-rail {
  background: var(--warning);
}
/* Tons que entraram com a agenda multi-entidade. O fundo é derivado do tom com
   color-mix em vez de um literal novo (design-system/MASTER.md §5). */
.tl-card.goal {
  background: color-mix(in srgb, var(--meta-from) 8%, var(--surface));
}
.tl-card.goal .tl-rail {
  background: var(--meta-from);
}
.tl-card.project {
  background: color-mix(in srgb, var(--proj-empresa-bg) 60%, var(--surface));
}
.tl-card.project .tl-rail {
  background: var(--proj-empresa-fg);
}
.tl-card.payment-in {
  background: color-mix(in srgb, var(--pag-pago) 8%, var(--surface));
}
.tl-card.payment-in .tl-rail {
  background: var(--pag-pago);
}
.tl-card.payment-out {
  background: color-mix(in srgb, var(--pag-pendente) 8%, var(--surface));
}
.tl-card.payment-out .tl-rail {
  background: var(--pag-pendente);
}
.tl-card.done {
  opacity: 0.55;
}
.tl-card.done .tl-title {
  text-decoration: line-through;
}

/* ── Empty ────────────────────────────────────── */
.tl-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-4);
  font-size: 13px;
}
</style>

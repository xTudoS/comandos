<script setup lang="ts">
import type { AgendaItem } from '~~/shared/agendaItem'
import type { AgendaRange } from '~/composables/useAgendaWindow'
import { DOW_FULL, addDays, fmtDate, sameDay } from '~/utils/dates'
import AgendaEventCard from '~/components/agenda/AgendaEventCard.vue'

/**
 * Grade dia/semana. Componente BURRO: recebe os itens já projetados e devolve
 * intenções (`open`, `move`) para o pai rotear. Antes ele chamava `useTasks`,
 * `useCompanies` e a store de projetos por conta própria, resolvia subtítulo
 * duplicando a lógica da timeline, e só sabia abrir e reagendar TAREFA — o que
 * obrigou `/metas` a ter um calendário próprio.
 */
const props = defineProps<{ range: AgendaRange; items: AgendaItem[] }>()

const emit = defineEmits<{
  open: [item: AgendaItem]
  /** Soltou o card num novo dia/hora. O pai decide como persistir por tipo. */
  move: [payload: { item: AgendaItem; date: string; time: string }]
}>()

// ── Grid geometry ────────────────────────────────────────
const START_H = 7
const END_H = 22
const DEFAULT_SCROLL_HOUR = 8
const HOURS = Array.from({ length: END_H - START_H }, (_, i) => START_H + i)

// Densidade vertical da linha do tempo: pixels por hora. O zoom-in/out de
// densidade (pinch / botões) escala este valor — comprimir mostra MAIS dados
// na tela; expandir dá mais detalhe por evento. O zoom de PERÍODO (abaixo) é
// independente e muda a quantidade de dias.
const MIN_HOUR_H = 38
const MAX_HOUR_H = 168
const DEFAULT_HOUR_H = 98
const hourH = ref(DEFAULT_HOUR_H)
const clampHourH = (v: number) => Math.min(MAX_HOUR_H, Math.max(MIN_HOUR_H, v))

// ── Zoom de densidade vertical (mostra mais/menos dados) ─────────────────────
// Ajusta `hourH` mantendo o ponto de tempo sob o cursor (ou o centro visível)
// ancorado — igual a um zoom de mapa, o que dá a sensação natural.
function setHourH(next: number, anchorClientY?: number) {
  const clamped = clampHourH(next)
  const body = bodyEl.value
  if (!body) {
    hourH.value = clamped
    return
  }
  const rect = body.getBoundingClientRect()
  const anchorY = (anchorClientY ?? rect.top + body.clientHeight / 2) - rect.top
  const totalBefore = HOURS.length * hourH.value
  const ratio = (body.scrollTop + anchorY) / totalBefore
  hourH.value = clamped
  // Reaplica o scroll só após o DOM refletir a nova altura.
  void nextTick(() => {
    body.scrollTop = ratio * HOURS.length * clamped - anchorY
  })
}

// Pinch no trackpad / ctrl+roda: zoom contínuo, proporcional à intensidade.
function onWheelZoom(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  setHourH(hourH.value * Math.exp(-e.deltaY * 0.0016), e.clientY)
}

// Botões (− / +): tween curto com easeOut para um passo suave e natural,
// ancorado no centro do corpo visível.
let densityRAF = 0
function animateHourH(target: number) {
  cancelAnimationFrame(densityRAF)
  const body = bodyEl.value
  const from = hourH.value
  const to = clampHourH(target)
  if (from === to) return
  const anchorY = body ? body.clientHeight / 2 : 0
  const ratio = body ? (body.scrollTop + anchorY) / (HOURS.length * from) : 0
  const start = performance.now()
  const DUR = 220
  const tick = (t: number) => {
    const p = Math.min(1, (t - start) / DUR)
    const eased = 1 - Math.pow(1 - p, 3)
    hourH.value = from + (to - from) * eased
    if (body) body.scrollTop = ratio * HOURS.length * hourH.value - anchorY
    if (p < 1) densityRAF = requestAnimationFrame(tick)
  }
  densityRAF = requestAnimationFrame(tick)
}
const DENSITY_STEP = 16
function compactRows() {
  animateHourH(hourH.value - DENSITY_STEP) // zoom-out → mais dados
}
function expandRows() {
  animateHourH(hourH.value + DENSITY_STEP) // zoom-in → mais detalhe
}

// Largura mínima por coluna: colunas preenchem a largura quando cabem (dia/
// semana) e, quando não cabem (mês), a grade rola na horizontal sem espremer.
const MIN_COL = 110
const GUTTER = 66
const gridCols = computed(
  () => `${GUTTER}px repeat(${days.value.length}, minmax(${MIN_COL}px, 1fr))`,
)
const scrollMinW = computed(() => `${GUTTER + days.value.length * MIN_COL}px`)

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
      key: fmtDate(d),
      date: d,
      label: DOW_FULL[dow]!.slice(0, 3).toUpperCase(),
      num: d.getDate(),
      dm: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      isToday: sameDay(d, today),
      isWeekend: dow === 0 || dow === 6,
      isPast: d < today,
    }
  }),
)

// ── Now indicator ────────────────────────────────────────
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined
const bodyEl = ref<HTMLElement>()
onMounted(() => {
  if (bodyEl.value) bodyEl.value.scrollTop = (DEFAULT_SCROLL_HOUR - START_H) * hourH.value
  clock = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  cancelAnimationFrame(densityRAF)
})

const nowTop = computed(() => {
  const mins = (now.value.getHours() - START_H) * 60 + now.value.getMinutes()
  return (mins / 60) * hourH.value
})
const nowVisible = computed(
  () => now.value.getHours() >= START_H && now.value.getHours() < END_H,
)
const nowLabel = computed(() => {
  const h = now.value.getHours()
  const m = now.value.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
})

// ── Positioned events (with overlap columns) ─────────────
function fmtClock(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

// Horário compacto dentro do bloco (12h sem sufixo, igual à referência do
// designer): "10:00 – 10:30", "1:00 – 2:00".
function hm12(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

type Positioned = {
  item: AgendaItem
  top: number
  height: number
  leftPct: number
  widthPct: number
  startMin: number
  endMin: number
  timeLabel: string
}

/** Minutos do dia a partir de `HH:MM`, ou `null` se não houver hora. */
function minutesOf(time: string | null): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h! * 60 + m!
}

/**
 * Duração em minutos de um bloco. Sem `endTime` declarado, cai nos 45min que
 * esta grade já usava — a duração continua sendo uma decisão da VIEW, não do
 * dado (o item só diz "começa às X, fim não declarado").
 */
function durationOf(item: AgendaItem, startMin: number): number {
  if (item.endDate !== item.date) return END_H * 60 - startMin
  const endMin = minutesOf(item.endTime)
  if (endMin === null || endMin <= startMin) return 45
  return endMin - startMin
}

/**
 * Um item entra na grade de horas só se tem hora E ela cabe na janela visível
 * (07–22). Fora disso vai para a faixa de dia todo — antes, item às 06:00
 * ganhava `top` negativo e sumia da tela sem aviso.
 */
function fitsGrid(item: AgendaItem): boolean {
  if (item.allDay || item.shape === 'span') return false
  const startMin = minutesOf(item.time)
  return startMin !== null && startMin >= START_H * 60 && startMin < END_H * 60
}

const perDay = computed<Record<string, Positioned[]>>(() => {
  const out: Record<string, Positioned[]> = {}
  for (const d of days.value) out[d.key] = []
  for (const e of props.items) {
    if (!(e.date in out) || !fitsGrid(e)) continue
    const startMin = minutesOf(e.time)!
    const dur = durationOf(e, startMin)
    const endMin = startMin + dur
    const top = ((startMin - START_H * 60) / 60) * hourH.value
    const height = Math.max(28, (dur / 60) * hourH.value - 4)
    out[e.date]!.push({
      item: e,
      top,
      height,
      leftPct: 0,
      widthPct: 100,
      startMin,
      endMin,
      timeLabel: `${hm12(startMin)} – ${hm12(endMin)}`,
    })
  }
  // Side-by-side columns for overlapping events.
  for (const key of Object.keys(out)) {
    const items = out[key]!.sort((a, b) => a.startMin - b.startMin)
    let cluster: Positioned[] = []
    let clusterEnd = -1
    const flush = () => {
      const n = cluster.length
      cluster.forEach((it, i) => {
        it.widthPct = 100 / n
        it.leftPct = (100 / n) * i
      })
      cluster = []
    }
    for (const it of items) {
      if (cluster.length && it.startMin >= clusterEnd) flush()
      cluster.push(it)
      clusterEnd = Math.max(clusterEnd, it.endMin)
    }
    flush()
  }
  return out
})

// ── Faixa "dia todo" ────────────────────────────────────────────────────────
// Esta faixa não existia. Sem ela, a grade descartava todo item sem hora — o
// que fazia TODO follow-up sumir da visão principal (follow-up nunca tem hora,
// por construção) e impedia meta e pagamento de aparecerem, já que ambos são
// marcos de dia. É pré-requisito da agenda multi-entidade, não polimento.
type BandBar = {
  item: AgendaItem
  /** Índice da coluna de dia onde a barra começa (0-based na janela). */
  startIndex: number
  /** Quantas colunas ela ocupa. */
  span: number
  lane: number
  /** A barra continua antes/depois da janela visível — o pai recorta. */
  continuesBefore: boolean
  continuesAfter: boolean
  /** Hora original, quando o item foi expulso da grade por cair fora de 07–22. */
  offGridTime: string
}

const dayIndex = computed(() => new Map(days.value.map((d, i) => [d.key, i])))

const allDayBars = computed<BandBar[]>(() => {
  const index = dayIndex.value
  const lastIndex = days.value.length - 1
  if (lastIndex < 0) return []

  const bars = props.items
    .filter((item) => !fitsGrid(item))
    .map((item) => {
      // Faixa multi-dia é recortada nas bordas da janela: a barra continua
      // fora dela, e o `continues*` é o que o CSS usa para "cortar" a ponta.
      const rawStart = index.get(item.date)
      const rawEnd = index.get(item.endDate)
      const startIndex = rawStart ?? (item.date < props.range.from ? 0 : -1)
      const endIndex = rawEnd ?? (item.endDate > props.range.to ? lastIndex : -1)
      if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return null
      const startMin = minutesOf(item.time)
      return {
        item,
        startIndex,
        span: endIndex - startIndex + 1,
        lane: 0,
        continuesBefore: item.date < props.range.from,
        continuesAfter: item.endDate > props.range.to,
        offGridTime: startMin === null ? '' : item.time!,
      } satisfies BandBar
    })
    .filter((b): b is BandBar => b !== null)
    // Barras largas primeiro para que atravessem por cima das curtas.
    .sort((a, b) => a.startIndex - b.startIndex || b.span - a.span)

  // Empilhamento greedy: a primeira faixa livre em toda a extensão da barra.
  const laneEnds: number[] = []
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end < bar.startIndex)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = bar.startIndex + bar.span - 1
    bar.lane = lane
  }
  return bars
})

const bandLanes = computed(() =>
  allDayBars.value.reduce((max, bar) => Math.max(max, bar.lane + 1), 0),
)

// ── Upcoming strip (next scheduled events from now) ──────
const upcoming = computed(() => {
  const nowMs = now.value.getTime()
  return props.items
    .filter((e) => fitsGrid(e) && !e.done)
    .map((e) => {
      const startMin = minutesOf(e.time)!
      const dt = new Date(`${e.date}T00:00:00`)
      dt.setHours(Math.floor(startMin / 60), startMin % 60)
      const dur = durationOf(e, startMin)
      return {
        item: e,
        ts: dt.getTime(),
        startMin,
        label: `${fmtClock(startMin)} – ${fmtClock(startMin + dur)}`,
      }
    })
    .filter((x) => x.ts + 30 * 60_000 >= nowMs)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 4)
})

// Rótulo de contagem por dia, no cabeçalho. Conta as duas faixas — a de horas e
// a de dia todo —, senão um dia só com metas e pagamentos apareceria "livre".
function countLabel(key: string) {
  const index = dayIndex.value.get(key)
  const inGrid = perDay.value[key]?.length ?? 0
  const inBand =
    index === undefined
      ? 0
      : allDayBars.value.filter(
          (b) => index >= b.startIndex && index < b.startIndex + b.span,
        ).length
  const n = inGrid + inBand
  if (n === 0) return 'livre'
  return `${n} ${n === 1 ? 'item' : 'itens'}`
}

// Fuso exibido no canto superior esquerdo da grade.
const tzLabel = (() => {
  const off = -new Date().getTimezoneOffset() / 60
  const sign = off >= 0 ? '+' : '−'
  return `GMT ${sign}${Math.abs(off)}`
})()

// ── Abrir ────────────────────────────────────────────────
// Antes: `tasks.value.find(...)` e, se a tarefa não estivesse no cache, o
// clique não fazia NADA — silenciosamente. Agora o item sobe para o pai, que
// sabe rotear por tipo e buscar o que faltar.
function openItem(item: AgendaItem) {
  emit('open', item)
}

// ── Drag-and-drop: reagenda (novo dia = coluna, nova hora = Y) ──────────────
// Só itens posicionados na grade de horas são arrastáveis; marco de dia todo
// não tem hora para onde ser solto.
type DayCol = { key: string; label: string; dm: string }
const drag = ref<{ item: AgendaItem; grabOffsetY: number } | null>(null)
const dragOverDay = ref<string | null>(null)
// Tooltip que segue o cursor mostrando o destino exato (dia + HH:MM).
const dragTip = ref<{ x: number; y: number; label: string } | null>(null)
const pad2 = (n: number) => String(n).padStart(2, '0')

// Y dentro de uma coluna → minutos do dia, em passos de 5 min, dentro da janela.
function minuteAt(colEl: HTMLElement, clientY: number, grabOffsetY: number): number {
  const rect = colEl.getBoundingClientRect()
  const topPx = clientY - rect.top - grabOffsetY
  const rawMin = START_H * 60 + (topPx / hourH.value) * 60
  return Math.max(START_H * 60, Math.min(Math.round(rawMin / 5) * 5, END_H * 60 - 5))
}
const hhmm = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`

function onEventDragStart(p: Positioned, e: DragEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  drag.value = { item: p.item, grabOffsetY: e.clientY - rect.top }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', p.item.entityId)
  }
}
function onColDragOver(d: DayCol, e: DragEvent) {
  if (!drag.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverDay.value = d.key
  const min = minuteAt(e.currentTarget as HTMLElement, e.clientY, drag.value.grabOffsetY)
  dragTip.value = { x: e.clientX, y: e.clientY, label: `${d.label} ${d.dm} · ${hhmm(min)}` }
}
function onColDragLeave(dayKey: string) {
  if (dragOverDay.value === dayKey) dragOverDay.value = null
}
function onColDrop(d: DayCol, e: DragEvent) {
  if (!drag.value) return
  e.preventDefault()
  const min = minuteAt(e.currentTarget as HTMLElement, e.clientY, drag.value.grabOffsetY)
  const item = drag.value.item
  drag.value = null
  dragOverDay.value = null
  dragTip.value = null
  emit('move', { item, date: d.key, time: hhmm(min) })
}
function onEventDragEnd() {
  drag.value = null
  dragOverDay.value = null
  dragTip.value = null
}

// Preserva o scroll vertical através do cross-fade do zoom (a altura da grade é
// constante, então o offset continua válido). Sem isso, o out-in zera o scroll.
let savedScroll = 0
function onZoomLeave() {
  savedScroll = bodyEl.value?.scrollTop ?? 0
}
function onZoomEnter() {
  if (bodyEl.value) bodyEl.value.scrollTop = savedScroll
}
</script>

<template>
  <div class="cal">
    <!-- Upcoming strip -->
    <div v-if="upcoming.length" class="cal-strip">
      <button
        v-for="(u, i) in upcoming"
        :key="`${u.item.id}-${i}`"
        type="button"
        class="strip-card"
        :class="u.item.tone"
        @click="openItem(u.item)"
      >
        <span class="sc-time">{{ u.label }}</span>
        <span class="sc-row">
          <span class="sc-title">{{ u.item.title }}</span>
          <AvatarStack
            v-if="u.item.delegatePersonName"
            :people="[{ name: u.item.delegatePersonName }]"
            :size="22"
            :max="3"
          />
        </span>
      </button>
    </div>

    <!-- Toolbar: zoom de período (dia / semana / mês) -->
    <div class="cal-toolbar">
      <span class="cal-hint">Arraste para reagendar · ctrl/⌘ + scroll = densidade</span>
      <div class="cal-controls">
        <!-- Densidade vertical: comprime/expande as horas (mais ou menos dados) -->
        <div class="cal-zoom" role="group" aria-label="Densidade da linha do tempo">
          <button
            type="button"
            class="cal-zoom-btn"
            aria-label="Compactar horas (ver mais dados)"
            :disabled="hourH <= MIN_HOUR_H + 0.5"
            @click="compactRows"
          >
            <BaseIcon name="minus" :size="16" />
          </button>
          <BaseIcon name="rows-3" :size="15" class="cal-zoom-ico" aria-hidden="true" />
          <button
            type="button"
            class="cal-zoom-btn"
            aria-label="Expandir horas (mais detalhe)"
            :disabled="hourH >= MAX_HOUR_H - 0.5"
            @click="expandRows"
          >
            <BaseIcon name="plus" :size="16" />
          </button>
        </div>
      </div>
    </div>

    <!-- Grid (rola na horizontal quando há muitos dias; ctrl/⌘+scroll = zoom) -->
    <div class="cal-grid" @wheel="onWheelZoom">
      <div class="cal-xscroll">
        <!-- Header -->
        <div class="cal-head" :style="{ gridTemplateColumns: gridCols, minWidth: scrollMinW }">
          <div class="cal-corner">
            <span>{{ tzLabel }}</span>
          </div>
          <div
            v-for="d in days"
            :key="d.key"
            class="cal-head-cell"
            :class="{ today: d.isToday, weekend: d.isWeekend }"
          >
            <span class="ch-num">{{ d.num }}</span>
            <span class="ch-meta">
              <span class="ch-dow">{{ d.label }}</span>
              <span class="ch-count">{{ countLabel(d.key) }}</span>
            </span>
          </div>
        </div>

        <!-- Faixa "dia todo": marcos (follow-up, prazo de meta, vencimento de
             pagamento), faixas multi-dia e o que caiu fora de 07–22. -->
        <div
          v-if="allDayBars.length"
          class="cal-allday"
          :style="{
            gridTemplateColumns: gridCols,
            gridTemplateRows: `repeat(${bandLanes}, 22px)`,
            minWidth: scrollMinW,
          }"
        >
          <div class="cal-allday-label" :style="{ gridRow: `1 / span ${bandLanes}` }">
            dia todo
          </div>
          <button
            v-for="bar in allDayBars"
            :key="bar.item.id"
            type="button"
            class="cal-allday-bar"
            :class="{
              'cuts-before': bar.continuesBefore,
              'cuts-after': bar.continuesAfter,
            }"
            :style="{
              gridColumn: `${2 + bar.startIndex} / span ${bar.span}`,
              gridRow: `${bar.lane + 1}`,
            }"
            @click="openItem(bar.item)"
          >
            <AgendaEventCard
              :item="bar.item"
              variant="pill"
              :time-label="bar.offGridTime"
            />
          </button>
        </div>

        <!-- Body -->
        <div ref="bodyEl" class="cal-body" :style="{ minWidth: scrollMinW }">
          <Transition
            name="cal-fade"
            @before-leave="onZoomLeave"
            @enter="onZoomEnter"
          >
          <div :key="range.days" class="cal-canvas" :style="{ gridTemplateColumns: gridCols }">
          <!-- Hours gutter -->
          <div class="cal-hours">
            <div
              v-for="h in HOURS"
              :key="h"
              class="cal-hour"
              :style="{ height: `${hourH}px` }"
            >
              <span>{{ String(h % 12 || 12).padStart(2, '0') }}:00 {{ h >= 12 ? 'PM' : 'AM' }}</span>
            </div>
          </div>

          <!-- Day columns (drop target para reagendar) -->
          <div
            v-for="d in days"
            :key="d.key"
            class="cal-col"
            :class="{ today: d.isToday, weekend: d.isWeekend, 'drag-over': dragOverDay === d.key }"
            :style="{ height: `${HOURS.length * hourH}px` }"
            @dragover="onColDragOver(d, $event)"
            @dragleave="onColDragLeave(d.key)"
            @drop="onColDrop(d, $event)"
          >
            <div
              v-for="h in HOURS"
              :key="h"
              class="cal-slot"
              :style="{ height: `${hourH}px` }"
            />

            <!-- Now line -->
            <div v-if="d.isToday && nowVisible" class="cal-now" :style="{ top: `${nowTop}px` }">
              <span class="cal-now-line" />
            </div>

            <!-- Events -->
            <button
              v-for="(p, i) in perDay[d.key]"
              :key="`${p.item.id}-${i}`"
              type="button"
              class="cal-event"
              :class="{ dragging: drag?.item.id === p.item.id }"
              :style="{
                top: `${p.top}px`,
                height: `${p.height}px`,
                left: `calc(${p.leftPct}% + 4px)`,
                width: `calc(${p.widthPct}% - 8px)`,
              }"
              draggable="true"
              @click="openItem(p.item)"
              @dragstart="onEventDragStart(p, $event)"
              @dragend="onEventDragEnd"
            >
              <AgendaEventCard
                :item="p.item"
                variant="block"
                :height="p.height"
                :time-label="p.timeLabel"
              />
            </button>
          </div>

          <!-- Now time pill, in the gutter -->
          <div v-if="nowVisible" class="cal-now-pill" :style="{ top: `${nowTop}px` }">
            {{ nowLabel }}
          </div>
          </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Tooltip de destino durante o arraste (dia + hora exata) -->
    <div
      v-if="dragTip"
      class="cal-drag-tip"
      :style="{ left: `${dragTip.x + 14}px`, top: `${dragTip.y + 14}px` }"
    >
      {{ dragTip.label }}
    </div>
  </div>
</template>

<style scoped>
.cal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Upcoming strip ───────────────────────────── */
.cal-strip {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.strip-card {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  text-align: left;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease-spring);
}
.strip-card:hover {
  transform: translateY(-1px);
}
.sc-time {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.sc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Toolbar (zoom) ───────────────────────────── */
.cal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.cal-hint {
  font-size: 12px;
  color: var(--text-4);
}
.cal-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.cal-zoom-ico {
  color: var(--text-3);
  margin: 0 1px;
}
.cal-zoom {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.cal-zoom-btn {
  width: 30px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.cal-zoom-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.cal-zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Grid shell ───────────────────────────────── */
.cal-grid {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
/* Rolagem horizontal compartilhada por cabeçalho + corpo (mantém alinhados). */
.cal-xscroll {
  overflow-x: auto;
}
.cal-head {
  display: grid;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.cal-corner {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 8px 10px;
  border-right: 1px solid var(--border);
}
.cal-corner span {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
.cal-head-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px;
  border-left: 1px solid var(--border-faint);
}
.ch-num {
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cal-head-cell.weekend .ch-num {
  color: var(--text-3);
}
.ch-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ch-dow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-2);
}
.cal-head-cell.weekend .ch-dow {
  color: var(--text-4);
}
.ch-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Hoje: badge preenchido no número (igual à referência do designer) */
.cal-head-cell.today .ch-num {
  color: var(--accent-fg);
  background: var(--accent);
  border-radius: 10px;
  padding: 6px 8px;
}
.cal-head-cell.today .ch-dow {
  color: var(--accent);
}

/* ── Body ─────────────────────────────────────── */
/* ── Faixa "dia todo" ───────────────────────────────────────
   Fica entre o cabeçalho e a grade de horas, e é onde caem marcos (follow-up,
   prazo de meta, vencimento de pagamento), faixas multi-dia e o que não coube
   na janela de 07–22. Rola na vertical em vez de esconder atrás de um "+N":
   um item que some sem aviso foi exatamente o defeito que esta faixa conserta. */
.cal-allday {
  display: grid;
  align-items: center;
  gap: 2px 0;
  padding: 4px 0;
  max-height: 92px;
  overflow-y: auto;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.cal-allday-label {
  grid-column: 1;
  align-self: center;
  padding: 0 8px;
  text-align: right;
  border-right: 1px solid var(--border);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.cal-allday-bar {
  min-width: 0;
  margin: 0 4px;
  padding: 0;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  /* Ancora as container queries do card: numa coluna estreita ele esconde o
     valor para o título caber (ver AgendaEventCard). */
  container-type: inline-size;
}
/* Faixa que continua fora da janela: a ponta cortada evita ler como se o item
   começasse ou terminasse exatamente na borda visível. */
.cal-allday-bar.cuts-before {
  margin-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  clip-path: polygon(6px 0, 100% 0, 100% 100%, 6px 100%, 0 50%);
}
.cal-allday-bar.cuts-after {
  margin-right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%);
}

.cal-body {
  position: relative;
  overflow-y: auto;
  max-height: min(64vh, 680px);
  scrollbar-gutter: stable;
}
.cal-canvas {
  display: grid;
  position: relative;
}
.cal-hours {
  border-right: 1px solid var(--border);
}
.cal-hour {
  position: relative;
}
.cal-hour span {
  position: absolute;
  top: -7px;
  right: 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
.cal-col {
  position: relative;
  border-left: 1px solid var(--border-faint);
}
.cal-col.weekend {
  background-image: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--text) 3%, transparent) 0,
    color-mix(in srgb, var(--text) 3%, transparent) 1px,
    transparent 1px,
    transparent 8px
  );
}
.cal-col.today {
  background: color-mix(in srgb, var(--accent) 3%, transparent);
}
.cal-col.drag-over {
  background: color-mix(in srgb, var(--accent) 9%, transparent);
  box-shadow: inset 0 0 0 2px var(--accent);
}
.cal-slot {
  border-bottom: 1px solid var(--border-faint);
}

/* ── Now line ─────────────────────────────────── */
.cal-now {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 4;
  pointer-events: none;
}
.cal-now-line {
  display: block;
  height: 2px;
  background: var(--danger);
}
.cal-now-pill {
  position: absolute;
  left: 6px;
  z-index: 6;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-fg);
  background: var(--danger);
  padding: 2px 6px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* ── Events ───────────────────────────────────── */
/* Wrapper posicionado + arrastável; a pintura do card é do AgendaEventCard. */
.cal-event {
  position: absolute;
  display: flex;
  padding: 0;
  text-align: left;
  border-radius: 12px;
  z-index: 1;
  cursor: grab;
  transition: transform var(--dur-fast) var(--ease-spring),
    box-shadow var(--dur-fast) var(--ease-spring);
}
.cal-event:hover {
  box-shadow: var(--shadow-md);
  z-index: 5;
}
.cal-event:active {
  cursor: grabbing;
}
.cal-event.dragging {
  opacity: 0.45;
}

/* strip card tints */
.strip-card.ceo {
  border-left: 3px solid var(--ceo-fg);
}
.strip-card.delegate {
  border-left: 3px solid var(--delego-fg);
}
.strip-card.personal {
  border-left: 3px solid var(--pessoal-fg);
}
.strip-card.fup {
  border-left: 3px solid var(--warning);
}
.strip-card.goal {
  border-left: 3px solid var(--meta-from);
}
.strip-card.project {
  border-left: 3px solid var(--proj-empresa-fg);
}
.strip-card.payment-in {
  border-left: 3px solid var(--pag-pago);
}
.strip-card.payment-out {
  border-left: 3px solid var(--pag-pendente);
}

/* ── Transição ao trocar de período (dia ↔ semana) ─────────
   Cross-fade curto e sobreposto: a camada que sai vira `absolute` para não
   empurrar o layout. A troca de período agora vem do switcher no topo da
   página; aqui só suavizamos a substituição da grade. */
.cal-canvas {
  transform-origin: 50% 36%;
}
.cal-fade-enter-active {
  transition: opacity 200ms var(--ease-spring), transform 240ms var(--ease-spring);
  will-change: opacity, transform;
}
.cal-fade-leave-active {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: opacity 140ms var(--ease-in), transform 160ms var(--ease-in);
  will-change: opacity, transform;
}
.cal-fade-enter-from {
  opacity: 0;
  transform: scale(0.97);
}
.cal-fade-leave-to {
  opacity: 0;
  transform: scale(1.02);
}

@media (prefers-reduced-motion: reduce) {
  .cal-fade-enter-active,
  .cal-fade-leave-active {
    transition: opacity 1ms linear;
    transform: none;
  }
}

/* ── Drag tooltip (destino exato) ─────────────── */
.cal-drag-tip {
  position: fixed;
  z-index: 50;
  pointer-events: none;
  background: var(--text);
  color: var(--panel);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
}
</style>

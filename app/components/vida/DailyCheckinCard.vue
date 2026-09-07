<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { TrainingLevel } from '~/composables/useLifeTracker'

const { ensureLoaded, hasCheckedInToday, todayCheckin, streak, submitCheckin } =
  useLifeTracker()
const { user } = useCurrentUser()

onMounted(() => ensureLoaded())

// ── Saudação ─────────────────────────────────────────────
const firstName = computed(() => (user.value?.name ?? '').trim().split(/\s+/)[0] ?? '')
const greeting = computed(() => {
  const h = new Date().getHours()
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  return firstName.value ? `${g}, ${firstName.value}` : g
})
const DOW = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
]
const MES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const dateLabel = computed(() => {
  const d = new Date()
  return `${DOW[d.getDay()]}, ${d.getDate()} de ${MES[d.getMonth()]}`
})

// ── Form ─────────────────────────────────────────────────
const editing = ref(false)
const form = reactive({
  sleepHours: 7,
  training: 'light' as TrainingLevel,
  nutrition: 7,
  mood: 7,
  energy: 7,
  note: '',
})

const showForm = computed(() => editing.value || !hasCheckedInToday.value)

const trainingOpts: { value: TrainingLevel; label: string }[] = [
  { value: 'none', label: 'Não treinei' },
  { value: 'light', label: 'Leve' },
  { value: 'hard', label: 'Forte' },
]

const moodEmoji = (v: number) => (v >= 8 ? '😄' : v >= 6 ? '🙂' : v >= 4 ? '😐' : '😔')

function startEdit() {
  const t = todayCheckin.value
  if (t) {
    form.sleepHours = t.sleepHours
    form.training = t.training
    form.nutrition = t.nutrition
    form.mood = t.mood
    form.energy = t.energy
    form.note = t.note
  }
  editing.value = true
}
function submit() {
  submitCheckin({ ...form })
  editing.value = false
}

const trainingLabel = computed(
  () => trainingOpts.find((o) => o.value === todayCheckin.value?.training)?.label ?? '—',
)

function sliderBg(v: number, color = 'var(--accent)') {
  const pct = v * 10
  return `linear-gradient(to right, ${color} ${pct}%, var(--border) ${pct}%)`
}
</script>

<template>
  <section class="checkin">
    <header class="ci-head">
      <div class="ci-greet">
        <h2>{{ greeting }}</h2>
        <p>{{ dateLabel }}</p>
      </div>
      <div v-if="streak > 0" class="ci-streak" :title="`${streak} dias seguidos`">
        <BaseIcon name="flame" :size="15" />
        {{ streak }}
      </div>
    </header>

    <!-- ── Form (check-in pendente ou em edição) ── -->
    <div v-if="showForm" class="ci-form">
      <div class="ci-grid">
        <!-- Sono -->
        <div class="ci-field">
          <div class="ci-label">
            <BaseIcon name="moon" :size="14" />
            <span>Sono</span>
            <strong>{{ form.sleepHours }}h</strong>
          </div>
          <input
            type="range" class="ci-slider" min="0" max="12" step="0.5"
            v-model.number="form.sleepHours"
            :style="{ background: sliderBg((form.sleepHours / 12) * 10, '#5856d6') }"
          >
        </div>

        <!-- Treino -->
        <div class="ci-field">
          <div class="ci-label">
            <BaseIcon name="dumbbell" :size="14" />
            <span>Treino</span>
          </div>
          <div class="ci-seg">
            <button
              v-for="o in trainingOpts" :key="o.value" type="button"
              class="ci-seg-btn" :class="{ on: form.training === o.value }"
              @click="form.training = o.value"
            >{{ o.label }}</button>
          </div>
        </div>

        <!-- Alimentação -->
        <div class="ci-field">
          <div class="ci-label">
            <BaseIcon name="apple" :size="14" />
            <span>Alimentação</span>
            <strong>{{ form.nutrition }}</strong>
          </div>
          <input
            type="range" class="ci-slider" min="0" max="10" step="1"
            v-model.number="form.nutrition"
            :style="{ background: sliderBg(form.nutrition, '#30a46c') }"
          >
        </div>

        <!-- Humor -->
        <div class="ci-field">
          <div class="ci-label">
            <span class="ci-emoji">{{ moodEmoji(form.mood) }}</span>
            <span>Humor</span>
            <strong>{{ form.mood }}</strong>
          </div>
          <input
            type="range" class="ci-slider" min="0" max="10" step="1"
            v-model.number="form.mood"
            :style="{ background: sliderBg(form.mood, '#ff2d55') }"
          >
        </div>

        <!-- Energia -->
        <div class="ci-field">
          <div class="ci-label">
            <BaseIcon name="zap" :size="14" />
            <span>Energia</span>
            <strong>{{ form.energy }}</strong>
          </div>
          <input
            type="range" class="ci-slider" min="0" max="10" step="1"
            v-model.number="form.energy"
            :style="{ background: sliderBg(form.energy, '#ff9500') }"
          >
        </div>

        <!-- Nota -->
        <div class="ci-field ci-field--note">
          <div class="ci-label">
            <BaseIcon name="pen-line" :size="14" />
            <span>Nota do dia</span>
          </div>
          <input
            v-model="form.note" type="text" class="ci-note"
            maxlength="140" placeholder="Como você está? (opcional)"
          >
        </div>
      </div>

      <div class="ci-actions">
        <button v-if="editing" type="button" class="ci-btn ghost" @click="editing = false">
          Cancelar
        </button>
        <button type="button" class="ci-btn primary" @click="submit">
          <BaseIcon name="check" :size="15" />
          {{ hasCheckedInToday ? 'Atualizar check-in' : 'Salvar check-in' }}
        </button>
      </div>
    </div>

    <!-- ── Resumo (check-in feito) ── -->
    <div v-else class="ci-done">
      <div class="ci-done-badge"><BaseIcon name="check" :size="15" /></div>
      <div class="ci-done-main">
        <div class="ci-done-title">Check-in de hoje registrado</div>
        <div class="ci-chips">
          <span class="ci-chip"><BaseIcon name="moon" :size="12" />{{ todayCheckin?.sleepHours }}h</span>
          <span class="ci-chip"><BaseIcon name="dumbbell" :size="12" />{{ trainingLabel }}</span>
          <span class="ci-chip"><BaseIcon name="apple" :size="12" />{{ todayCheckin?.nutrition }}/10</span>
          <span class="ci-chip">{{ moodEmoji(todayCheckin?.mood ?? 0) }} {{ todayCheckin?.mood }}/10</span>
          <span class="ci-chip"><BaseIcon name="zap" :size="12" />{{ todayCheckin?.energy }}/10</span>
        </div>
      </div>
      <button type="button" class="ci-edit" @click="startEdit">Editar</button>
    </div>
  </section>
</template>

<style scoped>
.checkin {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  padding: 20px 22px;
}
.ci-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.ci-greet h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}
.ci-greet p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-3);
}
.ci-streak {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ── Form ── */
.ci-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 22px;
}
.ci-field--note {
  grid-column: 1 / -1;
}
.ci-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  margin-bottom: 10px;
}
.ci-label :deep(svg) {
  color: var(--text-3);
}
.ci-label span {
  flex: 1;
}
.ci-label strong {
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.ci-emoji {
  font-size: 14px;
}

.ci-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}
.ci-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  box-shadow: var(--shadow-md);
  cursor: grab;
}
.ci-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-md);
  cursor: grab;
}

.ci-seg {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  background: color-mix(in srgb, var(--text) 5%, transparent);
  border-radius: var(--radius-md);
}
.ci-seg-btn {
  flex: 1;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
}
.ci-seg-btn.on {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.ci-note {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: 13px;
  color: var(--text);
}
.ci-note:focus {
  outline: none;
  border-color: var(--accent);
}

.ci-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.ci-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 18px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
}
.ci-btn.ghost {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
}
.ci-btn.ghost:hover {
  background: var(--surface-hover);
}
.ci-btn.primary {
  background: var(--primary);
  color: var(--on-primary);
}
.ci-btn.primary:hover {
  opacity: 0.92;
}

/* ── Done summary ── */
.ci-done {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ci-done-badge {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--delego-bg);
  color: var(--delego-fg);
}
.ci-done-main {
  flex: 1;
  min-width: 0;
}
.ci-done-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}
.ci-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ci-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-hover);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.ci-edit {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}
.ci-edit:hover {
  text-decoration: underline;
}

@media (max-width: 560px) {
  .ci-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .ci-done {
    flex-wrap: wrap;
  }
}
</style>

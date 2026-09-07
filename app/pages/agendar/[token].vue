<script setup lang="ts">
import {
  MIN_RANGE_MIN,
  fitsInFreeRange,
  formatDuration,
  minToTime,
  timeToMin,
  type TimeRange,
} from '~~/shared/bookingRanges'
import { isValidPhone } from '~~/shared/phone'
import { DOW_FULL, MESES } from '~/utils/dates'

definePageMeta({ layout: 'booking' })

type PublicLink = {
  title: string
  description: string
  suggestedDurationMinutes: number
  timezone: string
  /** Hoje no relógio do DONO — não do navegador de quem está olhando. */
  today: string
}

const STEPS = ['Data', 'Horário', 'Seus dados', 'Confirmar'] as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const { data: link, error: loadError } = await useFetch<PublicLink>(
  () => `/api/booking/${token.value}`,
  { key: () => `booking-${token.value}` },
)

const form = reactive({
  reason: '',
  description: '',
  name: '',
  email: '',
  whatsapp: '',
  date: '',
  start: '',
  end: '',
})

const step = ref(0)
const busy = ref(false)
const sent = ref(false)
const err = ref('')

// Foco vai para o título a cada troca de passo: sem isso quem navega por
// teclado ou leitor de tela continua no botão que acabou de sumir.
// Quem limpa o erro é `next()`/`back()`, não este watch: quando o envio falha e
// devolve a pessoa ao passo do horário, a mensagem que explica o porquê precisa
// sobreviver à troca de passo.
const heading = ref<HTMLElement | null>(null)
watch(step, async () => {
  await nextTick()
  heading.value?.focus()
})

// ── Faixas livres do dia ────────────────────────────────────────────────────
const ranges = ref<TimeRange[]>([])
const rangesLoading = ref(false)
const rangesError = ref('')

/**
 * Só busca — NÃO mexe no que a pessoa escolheu.
 *
 * Já limpou: era chamada tanto na troca de data quanto no erro de envio, e no
 * segundo caso apagava o horário embaixo do usuário, deixando o resumo com
 * "– · 0 min" no exato momento em que ele precisava conferir o que deu errado.
 * Limpar a escolha é decisão de quem troca a data, e mora no watch abaixo.
 */
async function loadRanges() {
  ranges.value = []
  if (!form.date) return
  rangesLoading.value = true
  rangesError.value = ''
  try {
    const res = await $fetch<{ ranges: TimeRange[] }>(`/api/booking/${token.value}/free`, {
      query: { date: form.date },
    })
    ranges.value = res.ranges
  } catch {
    rangesError.value = 'Não foi possível carregar os períodos livres.'
  } finally {
    rangesLoading.value = false
  }
}

watch(
  () => form.date,
  async () => {
    // Outra data, outras faixas: o horário anterior não quer dizer nada aqui.
    form.start = ''
    form.end = ''
    await loadRanges()
  },
)

/**
 * Clicar numa faixa só AUTO-PREENCHE os campos: o início é o da faixa e o fim é
 * a duração sugerida, encurtada se não couber. A pessoa edita à vontade depois —
 * a sugestão é atalho, não trava.
 */
function pickRange(r: TimeRange) {
  const start = timeToMin(r.start)
  const end = Math.min(start + (link.value?.suggestedDurationMinutes ?? 30), timeToMin(r.end))
  form.start = r.start
  form.end = minToTime(end)
}

// ── Validação por passo ─────────────────────────────────────────────────────
// Mesma regra que o servidor aplica, vinda do mesmo módulo — o passo 2 só libera
// quando o intervalo cabe inteiro numa faixa livre.
const timeIsValid = computed(() => {
  if (!form.start || !form.end) return false
  const req = { start: timeToMin(form.start), end: timeToMin(form.end) }
  if (req.end - req.start < MIN_RANGE_MIN) return false
  return fitsInFreeRange(req, ranges.value)
})

/**
 * Erros do passo de contato, com a MESMA regra do servidor.
 *
 * Existe porque um "obrigatório" no cliente e um `min(5)` no servidor deixavam
 * a pessoa chegar até a revisão com um WhatsApp de dois dígitos e só então
 * levar um 400. Validar aqui é o que permite falar do problema no campo certo,
 * na hora certa — o servidor continua sendo o portão, não a interface.
 */
const detailErrors = computed<Record<string, string>>(() => {
  const e: Record<string, string> = {}
  if (!form.reason.trim()) e.reason = 'Informe o motivo do agendamento.'
  if (!form.name.trim()) e.name = 'Informe seu nome.'
  if (!isValidPhone(form.whatsapp)) {
    e.whatsapp = 'Número incompleto. Confira o país e o número.'
  }
  if (!EMAIL_RE.test(form.email.trim())) e.email = 'Email inválido. Confira se não falta algo.'
  return e
})

// Erro só aparece depois que a pessoa saiu do campo (ou tentou avançar).
const touched = reactive<Record<string, boolean>>({})
function fieldError(key: string): string {
  return touched[key] ? (detailErrors.value[key] ?? '') : ''
}

const canAdvance = computed(() => {
  if (step.value === 0) return !!form.date
  if (step.value === 1) return timeIsValid.value
  // O passo de contato NÃO desabilita a CTA: um botão morto sem explicação é o
  // que gerou a confusão. Aqui ele responde ao clique acusando os campos.
  return true
})

const dateLabel = computed(() => {
  if (!form.date) return ''
  const d = new Date(form.date + 'T12:00:00')
  return `${DOW_FULL[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`
})

const timeLabel = computed(() => {
  if (!form.start || !form.end) return ''
  const mins = timeToMin(form.end) - timeToMin(form.start)
  return `${form.start} – ${form.end} · ${formatDuration(mins)}`
})

const FIELD_ORDER = ['reason', 'name', 'whatsapp', 'email'] as const

/** Acusa todos os campos de uma vez e leva o foco ao primeiro problema. */
async function reportDetailErrors(): Promise<void> {
  for (const k of FIELD_ORDER) touched[k] = true
  const first = FIELD_ORDER.find((k) => detailErrors.value[k])
  if (!first) return
  await nextTick()
  document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] textarea`)?.focus()
}

async function next() {
  if (step.value >= STEPS.length - 1) return
  if (step.value === 2) {
    if (Object.keys(detailErrors.value).length) {
      await reportDetailErrors()
      return
    }
  } else if (!canAdvance.value) {
    return
  }
  err.value = ''
  step.value += 1
}

function back() {
  if (step.value > 0) {
    err.value = ''
    step.value -= 1
  }
}

async function onSubmit() {
  if (busy.value) return
  busy.value = true
  err.value = ''
  try {
    await $fetch(`/api/booking/${token.value}/request`, {
      method: 'POST',
      body: {
        reason: form.reason.trim(),
        description: form.description.trim() || undefined,
        name: form.name.trim(),
        email: form.email.trim(),
        whatsapp: form.whatsapp.trim(),
        date: form.date,
        start: form.start,
        end: form.end,
      },
    })
    sent.value = true
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
    err.value = msg ?? 'Não foi possível enviar a solicitação.'
    // O horário pode ter sido tomado enquanto a pessoa preenchia os dados.
    // Recarrega as faixas (sem apagar a escolha dela) e, se o intervalo não
    // couber mais, leva de volta ao passo do horário dizendo o porquê — em vez
    // de deixá-la reenviando um horário que não existe mais.
    await loadRanges()
    if (!timeIsValid.value) {
      step.value = 1
      err.value = 'Esse horário acabou de ser ocupado. Escolha outro período.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="book">
    <!-- Link inválido / inativo -->
    <div v-if="loadError" class="state">
      <div class="state-icon"><BaseIcon name="calendar-x" :size="28" /></div>
      <h1 class="state-title">Link indisponível</h1>
      <p class="state-sub">Este link de agendamento não existe ou foi desativado.</p>
    </div>

    <!-- Sucesso -->
    <div v-else-if="sent" class="state">
      <div class="state-icon ok"><BaseIcon name="check" :size="28" /></div>
      <h1 class="state-title">Solicitação enviada</h1>
      <p class="state-sub">
        Obrigado, {{ form.name }}. Sua solicitação foi enviada e você receberá a resposta por email.
      </p>
      <div class="recap">
        <div class="recap-row">
          <BaseIcon name="calendar" :size="15" /><span>{{ dateLabel }}</span>
        </div>
        <div class="recap-row">
          <BaseIcon name="clock" :size="15" /><span class="tabular">{{ timeLabel }}</span>
        </div>
      </div>
    </div>

    <!-- Wizard -->
    <div v-else class="wizard">
      <!-- Cabeçalho: voltar + identidade + progresso -->
      <header class="head">
        <div class="head-row">
          <BaseButton
            v-if="step > 0"
            variant="ghost"
            size="icon-sm"
            icon-left="arrow-left"
            aria-label="Voltar ao passo anterior"
            @click="back"
          />
          <div v-else class="head-spacer" />
          <div class="head-text">
            <h1 class="head-title">{{ link?.title || 'Agendar' }}</h1>
            <p v-if="link?.description" class="head-sub">{{ link.description }}</p>
          </div>
          <div class="head-spacer" />
        </div>
        <AgendamentosBookingSteps :current="step" :labels="STEPS" @go="step = $event" />
      </header>

      <section class="panel">
        <!-- Passo 1: data -->
        <div v-if="step === 0" class="pane">
          <h2 ref="heading" class="pane-title" tabindex="-1">Escolha uma data</h2>
          <p class="pane-sub">Depois você define o horário exato dentro do que estiver livre.</p>
          <AgendamentosBookingCalendar v-model="form.date" :min-date="link?.today ?? ''" />
        </div>

        <!-- Passo 2: horário e duração -->
        <div v-else-if="step === 1" class="pane">
          <h2 ref="heading" class="pane-title" tabindex="-1">Escolha o horário</h2>
          <p class="pane-sub">{{ dateLabel }}</p>
          <AgendamentosBookingFreeRanges
            :ranges="ranges"
            :loading="rangesLoading"
            :error="rangesError"
            :start="form.start"
            :end="form.end"
            @pick="pickRange"
          />
          <AgendamentosBookingTimeRange
            v-if="ranges.length"
            v-model:start="form.start"
            v-model:end="form.end"
            :ranges="ranges"
          />
          <p v-if="link?.timezone" class="tz">
            <BaseIcon name="info" :size="13" />Horários no fuso de {{ link.timezone }}.
          </p>
        </div>

        <!-- Passo 3: dados de contato -->
        <div v-else-if="step === 2" class="pane">
          <h2 ref="heading" class="pane-title" tabindex="-1">Seus dados</h2>
          <p class="pane-sub">{{ dateLabel }} · {{ timeLabel }}</p>

          <div data-field="reason">
            <BaseField label="Motivo" required>
              <BaseInput
                v-model="form.reason"
                placeholder="Ex.: Reunião de alinhamento"
                @blur="touched.reason = true"
              />
            </BaseField>
            <p v-if="fieldError('reason')" class="field-err" role="alert">
              {{ fieldError('reason') }}
            </p>
          </div>

          <BaseField label="Descrição" hint="Detalhes que ajudem a se preparar (opcional).">
            <BaseTextarea v-model="form.description" :rows="3" placeholder="Contexto, links…" />
          </BaseField>

          <BaseFieldRow :cols="2">
            <div data-field="name">
              <BaseField label="Seu nome" required>
                <BaseInput
                  v-model="form.name"
                  placeholder="Nome completo"
                  @blur="touched.name = true"
                />
              </BaseField>
              <p v-if="fieldError('name')" class="field-err" role="alert">
                {{ fieldError('name') }}
              </p>
            </div>
            <div data-field="whatsapp" @focusout="touched.whatsapp = true">
              <BaseField label="WhatsApp" required>
                <AgendamentosBookingPhoneField v-model="form.whatsapp" />
              </BaseField>
              <p v-if="fieldError('whatsapp')" class="field-err" role="alert">
                {{ fieldError('whatsapp') }}
              </p>
            </div>
          </BaseFieldRow>

          <div data-field="email">
            <BaseField label="Email" required>
              <BaseInput
                v-model="form.email"
                type="email"
                placeholder="voce@email.com"
                @blur="touched.email = true"
              />
            </BaseField>
            <p v-if="fieldError('email')" class="field-err" role="alert">
              {{ fieldError('email') }}
            </p>
          </div>
        </div>

        <!-- Passo 4: revisar e confirmar -->
        <div v-else class="pane">
          <h2 ref="heading" class="pane-title" tabindex="-1">Revisar e confirmar</h2>
          <p class="pane-sub">Confira antes de enviar. Você recebe a resposta por email.</p>
          <AgendamentosBookingReview
            :date-label="dateLabel"
            :start="form.start"
            :end="form.end"
            :name="form.name"
            :whatsapp="form.whatsapp"
            :email="form.email"
            :reason="form.reason"
            :description="form.description"
            @edit="step = $event === 'when' ? 1 : 2"
          />
        </div>

        <p v-if="err" class="err" role="alert">{{ err }}</p>

        <div class="foot">
          <BaseButton
            v-if="step < STEPS.length - 1"
            variant="primary"
            class="wide"
            :disabled="!canAdvance"
            icon-right="arrow-right"
            @click="next"
          >
            Continuar
          </BaseButton>
          <BaseButton
            v-else
            variant="primary"
            class="wide"
            :loading="busy"
            @click="onSubmit"
          >
            {{ busy ? 'Enviando…' : 'Confirmar agendamento' }}
          </BaseButton>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.book {
  width: 100%;
}
.wizard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Cabeçalho ── */
.head {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.head-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* Mantém o título centrado quando o botão de voltar não está lá. */
.head-spacer {
  width: 32px;
  flex: none;
}
.head-text {
  flex: 1;
  min-width: 0;
  text-align: center;
}
.head-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
  line-height: 1.25;
}
.head-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 2px 0 0;
  line-height: 1.4;
}

/* ── Painel do passo ── */
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.pane-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text);
  margin: 0;
  line-height: 1.2;
}
/* O título recebe foco ao trocar de passo, mas não é um controle: sem anel. */
.pane-title:focus {
  outline: none;
  box-shadow: none;
}
.pane-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: -6px 0 4px;
  line-height: 1.5;
}
.tz {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
}
.err {
  font-size: 13px;
  color: var(--danger);
  margin: 0;
  line-height: 1.4;
}
/* Erro do campo: colado abaixo dele, não no rodapé do formulário. */
.field-err {
  font-size: 12px;
  color: var(--danger);
  margin: 6px 0 0;
  line-height: 1.4;
}
.foot {
  margin-top: 4px;
}
.wide {
  width: 100%;
}

@media (min-width: 720px) {
  .head-title {
    font-size: 20px;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
  }
  .wide {
    width: auto;
    min-width: 220px;
  }
}

/* ── Estados (erro / sucesso) ── */
.state {
  text-align: center;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.state-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--surface-hover);
  color: var(--text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.state-icon.ok {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}
.state-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text);
  margin: 0;
}
.state-sub {
  font-size: 14px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.55;
  max-width: 420px;
}
.recap {
  display: inline-flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 14px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.recap-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.recap-row :deep(svg) {
  color: var(--accent);
  flex: none;
}
</style>

<script setup lang="ts">
import { formatDuration, minToTime, timeToMin } from '~~/shared/bookingRanges'
import { DOW_FULL, MESES } from '~/utils/dates'

definePageMeta({ layout: 'booking' })

/**
 * A página do link que vai no email do agendamento.
 *
 * É o outro lado de `/agendar/[token]`: lá alguém PEDE um horário, aqui a mesma
 * pessoa confirma ou desmarca o que o dono já aceitou. Quem chega aqui não tem
 * conta — o token da URL é a autorização inteira, e por isso a rota é pública
 * (`PUBLIC_PREFIXES` em `app/middleware/auth.global.ts`).
 */
type RequesterView = {
  title: string
  description: string
  date: string
  time: string
  durationMinutes: number
  ownerName: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  confirmed: boolean
}

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const { data, error: loadError } = await useFetch<RequesterView>(
  () => `/api/booking/action/${token.value}`,
  { key: () => `booking-action-${token.value}` },
)

/** Estado local pós-ação: a resposta do POST substitui o que veio do GET. */
const view = ref<RequesterView | null>(null)
watchEffect(() => {
  if (data.value) view.value = data.value
})

const busy = ref<'confirmed' | 'declined' | null>(null)
const err = ref('')
/** Trava a tela depois de desmarcar — o token foi queimado no servidor. */
const doneDeclining = ref(false)

const dateLabel = computed(() => {
  const v = view.value
  if (!v) return ''
  const [y, m, d] = v.date.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  return `${DOW_FULL[dt.getDay()]}, ${d} de ${MESES[dt.getMonth()]} de ${y}`
})

const timeLabel = computed(() => {
  const v = view.value
  if (!v) return ''
  const end = minToTime(timeToMin(v.time) + v.durationMinutes)
  return `${v.time} – ${end} · ${formatDuration(v.durationMinutes)}`
})

async function decide(decision: 'confirmed' | 'declined') {
  if (busy.value) return
  busy.value = decision
  err.value = ''
  try {
    view.value = await $fetch<RequesterView>(`/api/booking/action/${token.value}/decision`, {
      method: 'POST',
      body: { decision },
    })
    if (decision === 'declined') doneDeclining.value = true
  } catch (e: unknown) {
    err.value =
      (e as { data?: { error?: { message?: string } } })?.data?.error?.message ??
      'Não foi possível registrar sua resposta. Tente de novo.'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="act">
    <!-- Token inválido, já usado ou expirado -->
    <div v-if="loadError || !view" class="state">
      <div class="state-icon"><BaseIcon name="calendar-x" :size="28" /></div>
      <h1 class="state-title">Link indisponível</h1>
      <p class="state-sub">
        Este link não é mais válido. Ele expira depois do compromisso e deixa de funcionar
        quando o agendamento é desmarcado ou remarcado.
      </p>
    </div>

    <!-- Desmarcado agora, ou já cancelado antes -->
    <div v-else-if="doneDeclining || view.status === 'cancelled'" class="state">
      <div class="state-icon"><BaseIcon name="calendar-x" :size="28" /></div>
      <h1 class="state-title">Agendamento desmarcado</h1>
      <p class="state-sub">
        Avisamos {{ view.ownerName }} e o horário voltou a ficar livre. Se mudar de ideia,
        é só solicitar de novo.
      </p>
    </div>

    <!-- O dono recusou; não há o que decidir -->
    <div v-else-if="view.status === 'rejected'" class="state">
      <div class="state-icon"><BaseIcon name="calendar-x" :size="28" /></div>
      <h1 class="state-title">Agendamento não confirmado</h1>
      <p class="state-sub">{{ view.ownerName }} não pôde confirmar este horário.</p>
    </div>

    <!-- O caso normal: aceito pelo dono, aguardando o solicitante -->
    <div v-else class="state">
      <div class="state-icon" :class="{ ok: view.confirmed }">
        <BaseIcon :name="view.confirmed ? 'check' : 'calendar-clock'" :size="28" />
      </div>
      <h1 class="state-title">
        {{ view.confirmed ? 'Presença confirmada' : 'Confirme seu agendamento' }}
      </h1>
      <p class="state-sub">
        <template v-if="view.confirmed">
          Tudo certo — {{ view.ownerName }} já sabe que você vem. Se algo mudar, você pode
          desmarcar por aqui.
        </template>
        <template v-else>
          {{ view.ownerName }} aceitou sua solicitação. Confirme que você vem, ou desmarque
          se não puder mais.
        </template>
      </p>

      <div class="recap">
        <div class="recap-row title">
          <BaseIcon name="target" :size="15" /><span>{{ view.title }}</span>
        </div>
        <div class="recap-row">
          <BaseIcon name="calendar" :size="15" /><span>{{ dateLabel }}</span>
        </div>
        <div class="recap-row">
          <BaseIcon name="clock" :size="15" /><span class="tabular">{{ timeLabel }}</span>
        </div>
      </div>

      <p v-if="err" class="err" role="alert">{{ err }}</p>

      <div class="actions">
        <BaseButton
          v-if="!view.confirmed"
          variant="primary"
          icon-left="check"
          :disabled="busy !== null"
          @click="decide('confirmed')"
        >
          {{ busy === 'confirmed' ? 'Confirmando…' : 'Confirmar presença' }}
        </BaseButton>
        <BaseButton
          variant="ghost"
          icon-left="calendar-x"
          class="decline"
          :disabled="busy !== null"
          @click="decide('declined')"
        >
          {{ busy === 'declined' ? 'Desmarcando…' : 'Não vou poder' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.act {
  width: 100%;
}

/* Mesma linguagem das telas de estado de `/agendar/[token]` — é o mesmo fluxo
   visto pela mesma pessoa, em momentos diferentes. */
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
}
.state-icon.ok {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}
.state-title {
  font-size: var(--fs-20);
  font-weight: var(--fw-bold);
  letter-spacing: -0.015em;
  color: var(--text);
  margin: 0;
}
.state-sub {
  font-size: var(--fs-14);
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
  text-align: left;
}
.recap-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-14);
  font-weight: var(--fw-medium);
  color: var(--text);
}
.recap-row.title {
  font-weight: var(--fw-semibold);
}
.recap-row :deep(svg) {
  color: var(--accent);
  flex: none;
}
.tabular {
  font-variant-numeric: tabular-nums;
}

.err {
  font-size: var(--fs-13);
  color: var(--danger);
  margin: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}
/* Desmarcar é destrutivo, mas não é a ação principal: cor de perigo só no
   texto, sem preenchimento que compita com o "Confirmar". */
.decline {
  color: var(--danger);
}
</style>

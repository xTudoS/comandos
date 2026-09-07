<script setup lang="ts">
import type { BookingRequestStatus } from '~/composables/useBookingRequests'
import { formatDuration, minToTime, timeToMin } from '~~/shared/bookingRanges'
import { formatInternational, toWhatsappDigits } from '~~/shared/phone'
const reqs = useBookingRequests()
const config = useRuntimeConfig()
const { show: toast } = useToast()
const { ask: askConfirm } = useConfirm()

function errMessage(e: unknown): string | undefined {
  return (e as { data?: { error?: { message?: string } } })?.data?.error?.message
}
// Prefere o host pelo qual a pessoa está usando o app, igual ao que
// resolveSiteOrigin() faz no servidor: o link copiado tem que bater com o
// domínio da aba, não com um valor fixo de configuração.
const siteUrl = computed(() =>
  ((import.meta.client ? window.location.origin : '') || config.public.siteUrl).replace(/\/$/, ''),
)

// ── Solicitações ──────────────────────────────────────────────────────────
const tab = ref<BookingRequestStatus>('pending')
const TABS: { key: BookingRequestStatus; label: string }[] = [
  { key: 'pending', label: 'Pendentes' },
  { key: 'accepted', label: 'Aceitas' },
  { key: 'rejected', label: 'Recusadas' },
  // Desmarcadas pelo próprio solicitante, pelo link do email. Aba separada das
  // recusadas: recusa é decisão sua, cancelamento é desistência da outra parte.
  { key: 'cancelled', label: 'Desmarcadas' },
]

const STATUS_LABEL: Record<BookingRequestStatus, string> = {
  pending: 'Pendente',
  accepted: 'Aceita',
  rejected: 'Recusada',
  cancelled: 'Desmarcada pelo solicitante',
}

const acting = ref<{ id: string; decision: 'accepted' | 'rejected' } | null>(null)
const message = ref('')
const busy = ref(false)
const actionErr = ref('')

watch(tab, (t) => reqs.refresh(t), { immediate: true })

function startDecision(id: string, decision: 'accepted' | 'rejected') {
  acting.value = { id, decision }
  message.value = ''
  actionErr.value = ''
}
function cancelDecision() {
  acting.value = null
  message.value = ''
}
async function confirmDecision() {
  if (!acting.value || busy.value) return
  busy.value = true
  actionErr.value = ''
  try {
    await reqs.decide(acting.value.id, acting.value.decision, message.value.trim() || undefined)
    acting.value = null
    message.value = ''
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
    actionErr.value = msg ?? 'Falha ao registrar a decisão.'
  } finally {
    busy.value = false
  }
}

// Os números novos chegam em E.164, então os dígitos já incluem o código do
// país — que é justamente o que o wa.me exige. Solicitações antigas, gravadas
// como texto livre sem país, continuam gerando um link inválido; não dá para
// adivinhar retroativamente de onde a pessoa era.
function waLink(whatsapp: string): string {
  return `https://wa.me/${toWhatsappDigits(whatsapp)}`
}
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
/** "09:00 – 09:30 · 30 min". O banco devolve o `time` com segundos. */
function fmtRange(r: { requestedTime: string; requestedDurationMinutes: number }): string {
  const start = r.requestedTime.slice(0, 5)
  const end = minToTime(timeToMin(start) + r.requestedDurationMinutes)
  return `${start} – ${end} · ${formatDuration(r.requestedDurationMinutes)}`
}

// ── Link único de agendamento ───────────────────────────────────────────────
// Cada pessoa tem exatamente um link, criado pelo próprio GET. Não há mais
// criação, exclusão nem disponibilidade semanal para gerenciar.
const bookingLink = useBookingLink()
const linkBusy = ref(false)
const linkErr = ref('')
const copied = ref(false)
const editing = ref(false)
const draft = reactive({ name: '', description: '', duration: '' })

const publicUrl = computed(() =>
  bookingLink.link.value ? `${siteUrl.value}/agendar/${bookingLink.link.value.token}` : '',
)

onMounted(() => bookingLink.refresh())

function startEdit() {
  const l = bookingLink.link.value
  draft.name = l?.name ?? ''
  draft.description = l?.description ?? ''
  draft.duration = l?.defaultDurationMinutes ? String(l.defaultDurationMinutes) : ''
  editing.value = true
  linkErr.value = ''
}

async function saveLink() {
  if (linkBusy.value) return
  linkBusy.value = true
  linkErr.value = ''
  try {
    const n = Number(draft.duration)
    await bookingLink.update({
      name: draft.name.trim(),
      description: draft.description.trim(),
      defaultDurationMinutes: draft.duration && Number.isFinite(n) && n > 0 ? n : null,
    })
    editing.value = false
    toast('Link atualizado')
  } catch (e: unknown) {
    linkErr.value = errMessage(e) ?? 'Falha ao salvar.'
  } finally {
    linkBusy.value = false
  }
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(publicUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    linkErr.value = 'Não foi possível copiar.'
  }
}

async function toggleActive() {
  const l = bookingLink.link.value
  if (!l || linkBusy.value) return
  linkBusy.value = true
  linkErr.value = ''
  try {
    await bookingLink.update({ active: !l.active })
  } catch (e: unknown) {
    linkErr.value = errMessage(e) ?? 'Falha ao atualizar.'
  } finally {
    linkBusy.value = false
  }
}

function regenerate() {
  askConfirm(
    'Quem já tem o endereço atual perde o acesso. As solicitações recebidas são mantidas.',
    async () => {
      linkBusy.value = true
      linkErr.value = ''
      try {
        await bookingLink.regenerate()
        toast('Novo link gerado')
      } catch (e: unknown) {
        linkErr.value = errMessage(e) ?? 'Falha ao gerar novo link.'
      } finally {
        linkBusy.value = false
      }
    },
    { titulo: 'Gerar um link novo?', okLabel: 'Gerar novo', okClass: 'warning' },
  )
}
</script>

<template>
  <div class="agdmts-page">
    <PageHero
      title="Agendamentos"
      description="Solicitações recebidas pelo seu link público. Aceite para criar uma tarefa agendada ou recuse — a pessoa é avisada por email."
    />

    <!-- Link de agendamento (um por pessoa) -->
    <section class="link-card">
      <div class="lc-head">
        <div class="lc-title-wrap">
          <h2 class="lc-title">Seu link de agendamento</h2>
          <p class="lc-sub">
            Compartilhe e a pessoa escolhe um horário livre na sua agenda.
          </p>
        </div>
        <BaseBadge v-if="bookingLink.link.value && !bookingLink.link.value.active" variant="kind">
          Pausado
        </BaseBadge>
      </div>

      <p v-if="bookingLink.loading.value && !bookingLink.link.value" class="lc-muted">
        Carregando…
      </p>

      <template v-else-if="bookingLink.link.value">
        <div class="lc-url">
          <code class="url">{{ publicUrl }}</code>
          <BaseButton
            variant="ghost"
            size="sm"
            :icon-left="copied ? 'check' : 'copy'"
            aria-label="Copiar endereço do link"
            @click="copyUrl"
          >
            {{ copied ? 'Copiado' : 'Copiar' }}
          </BaseButton>
        </div>

        <!-- Leitura -->
        <div v-if="!editing" class="lc-meta">
          <span class="lc-field">
            <BaseIcon name="type" :size="13" />
            {{ bookingLink.link.value.name || 'Título padrão (seu nome)' }}
          </span>
          <span class="lc-field">
            <BaseIcon name="clock" :size="13" />
            {{
              bookingLink.link.value.defaultDurationMinutes
                ? `${bookingLink.link.value.defaultDurationMinutes} min sugeridos`
                : '30 min sugeridos'
            }}
          </span>
        </div>

        <!-- Edição -->
        <div v-else class="lc-form">
          <BaseField label="Título" hint="Aparece no topo da página pública. Vazio usa seu nome.">
            <BaseInput v-model="draft.name" placeholder="Ex.: Conversa com Alexandre" />
          </BaseField>
          <BaseField label="Descrição">
            <BaseTextarea
              v-model="draft.description"
              :rows="2"
              placeholder="O que a pessoa precisa saber antes de agendar…"
            />
          </BaseField>
          <BaseField
            label="Duração sugerida (min)"
            hint="Só pré-preenche o horário de fim. A pessoa pode alterar."
          >
            <BaseInput v-model="draft.duration" type="number" min="1" placeholder="30" />
          </BaseField>
        </div>

        <p v-if="linkErr" class="err-line" role="alert">
          <BaseIcon name="triangle-alert" :size="14" />{{ linkErr }}
        </p>

        <div class="lc-actions">
          <template v-if="editing">
            <BaseButton variant="ghost" :disabled="linkBusy" @click="editing = false">
              Cancelar
            </BaseButton>
            <BaseButton variant="primary" :loading="linkBusy" @click="saveLink">Salvar</BaseButton>
          </template>
          <template v-else>
            <BaseButton variant="ghost" icon-left="pencil" @click="startEdit">Editar</BaseButton>
            <BaseButton variant="ghost" :disabled="linkBusy" @click="toggleActive">
              {{ bookingLink.link.value.active ? 'Pausar' : 'Reativar' }}
            </BaseButton>
            <BaseButton variant="ghost" :disabled="linkBusy" @click="regenerate">
              Gerar novo
            </BaseButton>
          </template>
        </div>
      </template>

      <p v-else-if="bookingLink.error.value" class="err-line" role="alert">
        <BaseIcon name="triangle-alert" :size="14" />{{ bookingLink.error.value }}
      </p>
    </section>

    <!-- Solicitações -->
    <div class="tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="tab"
        :class="{ active: tab === t.key }"
        role="tab"
        :aria-selected="tab === t.key"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span v-if="t.key === 'pending' && reqs.pendingCount.value" class="tab-count">
          {{ reqs.pendingCount.value }}
        </span>
      </button>
    </div>

    <p v-if="reqs.error.value" class="err-line">
      <BaseIcon name="triangle-alert" :size="14" />{{ reqs.error.value }}
    </p>

    <div v-if="reqs.loading.value && !reqs.list.value.length" class="muted pad">Carregando…</div>

    <BaseEmptyState
      v-else-if="!reqs.list.value.length"
      icon="calendar-clock"
      :message="
        tab === 'pending'
          ? 'Nenhuma solicitação pendente. Compartilhe seu link acima para começar.'
          : 'Nada por aqui.'
      "
    />

    <ul v-else class="req-list">
      <li v-for="r in reqs.list.value" :key="r.id" class="req">
        <div class="req-head">
          <h3 class="req-title">{{ r.title }}</h3>
          <span class="req-when">
            <BaseIcon name="calendar" :size="13" />
            {{ fmtDate(r.requestedDate) }} · {{ fmtRange(r) }}
          </span>
        </div>

        <p v-if="r.description" class="req-desc">{{ r.description }}</p>

        <div class="req-meta">
          <span class="meta"><BaseIcon name="user" :size="13" />{{ r.requesterName }}</span>
          <a class="meta link" :href="`mailto:${r.requesterEmail}`">
            <BaseIcon name="mail" :size="13" />{{ r.requesterEmail }}
          </a>
          <a class="meta link" :href="waLink(r.requesterWhatsapp)" target="_blank" rel="noopener">
            <BaseIcon name="phone" :size="13" />{{ formatInternational(r.requesterWhatsapp) }}
          </a>
        </div>

        <div v-if="r.status !== 'pending'" class="decided">
          <span class="badge" :class="r.status">{{ STATUS_LABEL[r.status] }}</span>
          <!-- Só na aceita: diz se a outra ponta já respondeu ao email. Sem
               isso o dono não distingue "combinado" de "mandei e sumiu". -->
          <span
            v-if="r.status === 'accepted'"
            class="badge"
            :class="r.requesterConfirmedAt ? 'confirmed' : 'awaiting'"
          >
            {{ r.requesterConfirmedAt ? 'Confirmada pelo solicitante' : 'Aguardando confirmação' }}
          </span>
          <span v-if="r.decisionMessage" class="decided-msg">"{{ r.decisionMessage }}"</span>
        </div>

        <div v-else-if="acting && acting.id === r.id" class="composer">
          <span class="composer-label">
            {{ acting.decision === 'accepted' ? 'Aceitar' : 'Recusar' }} — mensagem opcional ao
            solicitante:
          </span>
          <BaseTextarea
            v-model="message"
            :rows="2"
            placeholder="Ex.: Confirmo! Te mando o link da sala."
          />
          <p v-if="actionErr" class="err-line">
            <BaseIcon name="triangle-alert" :size="14" />{{ actionErr }}
          </p>
          <div class="composer-actions">
            <button type="button" class="btn ghost" :disabled="busy" @click="cancelDecision">
              Cancelar
            </button>
            <button
              type="button"
              class="btn"
              :class="acting.decision === 'accepted' ? 'primary' : 'danger'"
              :disabled="busy"
              @click="confirmDecision"
            >
              {{ busy ? 'Enviando…' : acting.decision === 'accepted' ? 'Confirmar aceite' : 'Confirmar recusa' }}
            </button>
          </div>
        </div>

        <div v-else class="req-actions">
          <button type="button" class="btn ghost danger-text" @click="startDecision(r.id, 'rejected')">
            <BaseIcon name="x" :size="14" />Recusar
          </button>
          <button type="button" class="btn primary" @click="startDecision(r.id, 'accepted')">
            <BaseIcon name="check" :size="14" />Aceitar
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* ── Card do link único ── */
.link-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-alt);
  padding: 16px 18px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.lc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.lc-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 4px 0 0;
  line-height: 1.5;
}
.lc-muted {
  font-size: 13px;
  color: var(--text-3);
  margin: 0;
}
.lc-url {
  display: flex;
  align-items: center;
  gap: 8px;
}
.url {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  color: var(--text-2);
  overflow-x: auto;
  white-space: nowrap;
}
.lc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.lc-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}
.lc-field :deep(svg) {
  color: var(--text-4);
  flex: none;
}
.lc-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 520px) {
  .lc-actions :deep(button) {
    flex: 1;
  }
}

/* ── Abas ── */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.tab {
  appearance: none;
  background: none;
  border: none;
  padding: 10px 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-3);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color var(--dur-fast) var(--ease-spring);
}
.tab:hover {
  color: var(--text-2);
}
.tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.tab-count {
  font-size: 11px;
  font-weight: 600;
  background: var(--accent);
  color: var(--accent-fg);
  border-radius: var(--radius-pill);
  padding: 1px 6px;
  line-height: 1.4;
}

/* ── Solicitações ── */
.req-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.req {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--dur-fast) var(--ease-spring),
              border-color var(--dur-fast) var(--ease-spring);
}
.req:hover {
  box-shadow: var(--shadow-card-hover);
}
.req-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}
.req-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
  margin: 0;
}
.req-when {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.req-desc {
  font-size: 13px;
  color: var(--text-2);
  margin: 8px 0 0;
  line-height: 1.5;
  white-space: pre-wrap;
}
.req-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 12px;
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.meta.subtle {
  color: var(--text-4);
}
.meta.link {
  color: var(--accent);
  text-decoration: none;
}
.meta.link:hover {
  text-decoration: underline;
}
.req-actions,
.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.danger-text {
  color: var(--danger);
}
.composer {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.composer-label {
  font-size: 12px;
  color: var(--text-3);
}
.decided {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.badge {
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  padding: 2px 10px;
}
.badge.accepted {
  background: var(--success-bg);
  color: var(--success);
}
.badge.rejected {
  background: var(--danger-bg);
  color: var(--danger);
}
.badge.cancelled {
  background: var(--amber-bg);
  color: var(--amber);
}
.badge.confirmed {
  background: var(--success-bg);
  color: var(--success);
}
/* Aguardando não é erro — é só ausência de resposta. Cinza, não âmbar. */
.badge.awaiting {
  background: var(--surface-hover);
  color: var(--text-3);
}
.decided-msg {
  font-size: 12px;
  color: var(--text-3);
  font-style: italic;
}
.err-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--danger);
  margin: 8px 0;
}
.muted {
  color: var(--text-3);
  font-size: 13px;
}
.pad {
  padding: 10px 0;
}
</style>

<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const auth = useAuth()
const route = useRoute()
const demoMode = !!useRuntimeConfig().public.demoMode
const step = ref<'email' | 'otp'>('email')
const email = ref('')
const otp = ref('')
const err = ref('')
const sending = ref(false)
const verifying = ref(false)
const passkeying = ref(false)
const demoing = ref(false)
const notice = ref('')
const resendIn = ref(0)
let resendTimer: ReturnType<typeof setInterval> | undefined

function startResendCooldown() {
  resendIn.value = 30
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0 && resendTimer) {
      clearInterval(resendTimer)
      resendTimer = undefined
    }
  }, 1000)
}

onUnmounted(() => {
  if (resendTimer) clearInterval(resendTimer)
})

async function onSendOtp() {
  err.value = ''
  sending.value = true
  try {
    await auth.sendOtp(email.value)
    step.value = 'otp'
    startResendCooldown()
  } catch (e: unknown) {
    err.value = extractMessage(e, 'Falha ao enviar código.')
  } finally {
    sending.value = false
  }
}

async function onResendOtp() {
  if (resendIn.value > 0 || sending.value) return
  await onSendOtp()
}

async function onVerifyOtp() {
  err.value = ''
  verifying.value = true
  try {
    const res = await auth.verifyOtp(email.value, otp.value)
    if (res.status === 'approval-required') {
      const encoded = encodeURIComponent(email.value)
      const redirectParams = route.query.redirect ? `&redirect=${encodeURIComponent(route.query.redirect as string)}` : ''
      // Evita o bug "Skipped ViewTransition due to timeout" do Nuxt fazendo
      // a navegação ignorar a transição nativa.
      window.location.href = `/login/waiting?approval=${res.approvalId}&email=${encoded}${redirectParams}`
      // Para a execução para que o finally() não interfira enquanto o navegador descarrega a página.
      await new Promise(() => {}) 
    } else {
      // Login por código => este dispositivo (recém-aprovado) ainda não tem
      // passkey. Sempre oferece cadastrar uma aqui (a tela permite pular).
      const redirectParams = route.query.redirect ? `?redirect=${encodeURIComponent(route.query.redirect as string)}` : ''
      window.location.href = `/onboarding/passkey${redirectParams}`
      await new Promise(() => {})
    }
  } catch (e: unknown) {
    err.value = extractMessage(e, 'Código inválido.')
    // Código inválido/expirado: libera o reenvio na hora e orienta o usuário,
    // em vez de deixá-lo preso no cooldown sem saber o que fazer.
    if (isInvalidCodeError(e)) {
      resendIn.value = 0
      if (resendTimer) {
        clearInterval(resendTimer)
        resendTimer = undefined
      }
      err.value += ' Toque em "Reenviar código" para receber um novo.'
    }
  } finally {
    verifying.value = false
  }
}

async function destinationAfterLogin(): Promise<string> {
  const redirect = route.query.redirect as string
  const defaultDest = redirect && redirect.startsWith('/') ? redirect : '/trabalho'
  try {
    const res = await $fetch<{ passkeys: unknown[] }>('/api/auth/passkeys')
    // Sem passkey, a tela de passkey é a próxima e ELA decide o tour depois
    // (ver goNext em onboarding/passkey.vue) — encadear os dois aqui pularia
    // o cadastro de passkey.
    if (res.passkeys.length === 0) return '/onboarding/passkey'
    return await withOnboarding(defaultDest)
  } catch {
    return defaultDest
  }
}

async function onPasskey() {
  err.value = ''
  passkeying.value = true
  try {
    await auth.signInWithPasskey()
    window.location.href = await destinationAfterLogin()
    await new Promise(() => {})
  } catch (e: unknown) {
    err.value = extractMessage(e, 'Não foi possível autenticar com passkey.')
  } finally {
    passkeying.value = false
  }
}

async function onDemoLogin() {
  err.value = ''
  demoing.value = true
  try {
    await $fetch('/api/auth/demo-login', { method: 'POST' })
    // Reload completo para o better-auth reidratar a sessão a partir do cookie.
    window.location.href = '/trabalho'
  } catch (e: unknown) {
    err.value = extractMessage(e, 'Falha no login de demonstração.')
    demoing.value = false
  }
}

function extractMessage(e: unknown, fallback: string): string {
  // O nitro aninha o payload de createApiError em `data.data.error` e também
  // repete a mensagem no `data.message` de topo; o `data.error` de topo é só o
  // booleano do nitro. Antes líamos `data.error.message` (= undefined) e caíamos
  // no `message` cru do FetchError ("[POST] ...: 400").
  const err = e as {
    data?: { message?: string; data?: { error?: { message?: string } } }
    message?: string
  }
  return (
    err?.data?.data?.error?.message ??
    err?.data?.message ??
    err?.message ??
    fallback
  )
}

function isInvalidCodeError(e: unknown): boolean {
  const err = e as { data?: { data?: { error?: { code?: string } } } }
  return err?.data?.data?.error?.code === 'ERR_BAD_REQUEST'
}

onMounted(async () => {
  // Sessão expirada com o app aberto: o interceptador global de 401 redireciona
  // pra cá com `?expired=1`. Mostra o motivo em vez de deixar o usuário sem saber
  // por que caiu na tela de login.
  if (route.query.expired === '1') {
    notice.value = 'Sua sessão expirou. Entre novamente para continuar.'
  }

  const retryEmail = route.query.retry
  if (typeof retryEmail === 'string' && retryEmail.length > 0) {
    email.value = retryEmail
    notice.value = 'Dispositivo aprovado. Enviamos um novo código para entrar.'
    await onSendOtp()
  }
})
</script>

<template>
  <div class="login">

    <!-- ── Header ── -->
    <header class="intro">
      <img
        src="/logo-comando.svg"
        alt="Comando"
        class="app-logo"
        width="220"
        height="64"
      />
      <h1 class="title">
        {{ step === 'email' ? 'Entrar' : 'Verificar código' }}
      </h1>
      <p class="subtitle">
        <template v-if="step === 'email'">
          Use sua passkey ou receba um código por email.
        </template>
        <template v-else>
          Enviamos um código de 6 dígitos para <strong class="email-em">{{ email }}</strong>.
        </template>
      </p>
    </header>

    <!-- ── Notice ── -->
    <p v-if="notice" aria-live="polite" class="notice">{{ notice }}</p>

    <!-- ── Steps ── -->
    <Transition name="step" mode="out-in">

      <!-- Step 1 — Email -->
      <div v-if="step === 'email'" key="email" class="form-stack">

        <!-- Demo CTA (modo apresentação) -->
        <button
          v-if="demoMode"
          type="button"
          class="demo-btn"
          :class="{ loading: demoing }"
          :disabled="demoing"
          @click="onDemoLogin"
        >
          <span v-if="demoing" class="btn-loading-dots"><span /><span /><span /></span>
          <template v-else>▶ Entrar como demo</template>
        </button>

        <!-- Passkey CTA -->
        <button
          type="button"
          class="passkey-btn"
          :class="{ loading: passkeying }"
          :disabled="passkeying"
          @click="onPasskey"
        >
          <span class="passkey-btn-inner">
            <span class="passkey-icon" aria-hidden="true">
              <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8.5" cy="8.5" r="4.75" stroke="#C68A00" stroke-width="1.75"/>
                <path d="M12.25 12.25L19.5 19.5" stroke="#C68A00" stroke-width="1.75" stroke-linecap="round"/>
                <path d="M16.25 17L18.25 15" stroke="#C68A00" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </span>
            <span class="passkey-label">
              <span v-if="passkeying" class="passkey-loading-dots">
                <span /><span /><span />
              </span>
              <template v-else>Entrar com passkey</template>
            </span>
          </span>
        </button>
        <p class="passkey-hint">Mais rápido · funciona offline depois do primeiro uso</p>

        <!-- Divider -->
        <div class="divider" role="separator">
          <span>ou com email</span>
        </div>

        <!-- Email field -->
        <div class="field">
          <label for="login-email" class="field-label">Email</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            placeholder="seu@email.com"
            autocomplete="email"
            autocapitalize="off"
            class="text-input"
            @keyup.enter="email && onSendOtp()"
          />
        </div>

        <!-- Submit -->
        <button
          type="button"
          class="primary-btn"
          :class="{ 'primary-btn--disabled': !email || sending, loading: sending }"
          :disabled="!email || sending"
          @click="onSendOtp"
        >
          <span v-if="sending" class="btn-loading-dots"><span /><span /><span /></span>
          <template v-else>Enviar código</template>
        </button>

      </div>

      <!-- Step 2 — OTP -->
      <div v-else key="otp" class="form-stack">

        <!-- OTP field -->
        <div class="field">
          <label for="login-otp" class="field-label">Código de 6 dígitos</label>
          <input
            id="login-otp"
            v-model="otp"
            type="text"
            inputmode="numeric"
            placeholder="000000"
            aria-label="Código de 6 dígitos"
            maxlength="6"
            autocomplete="one-time-code"
            class="text-input otp-input"
            autofocus
            @keyup.enter="otp.length === 6 && onVerifyOtp()"
          />
        </div>

        <!-- Confirm -->
        <button
          type="button"
          class="primary-btn"
          :class="{ 'primary-btn--disabled': otp.length !== 6 || verifying, loading: verifying }"
          :disabled="otp.length !== 6 || verifying"
          @click="onVerifyOtp"
        >
          <span v-if="verifying" class="btn-loading-dots"><span /><span /><span /></span>
          <template v-else>Confirmar</template>
        </button>

        <!-- Secondary row -->
        <div class="secondary-row">
          <button type="button" class="ghost-btn" @click="step = 'email'">
            <svg class="ghost-btn-icon" viewBox="0 0 16 16" fill="none">
              <path d="M10 13L5 8l5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Voltar
          </button>
          <button
            type="button"
            class="ghost-btn"
            :disabled="resendIn > 0 || sending"
            :class="{ 'ghost-btn--disabled': resendIn > 0 || sending }"
            @click="onResendOtp"
          >
            <span v-if="sending" class="ghost-loading-dots"><span /><span /><span /></span>
            <template v-else>
              {{ resendIn > 0 ? `Reenviar em ${resendIn}s` : 'Reenviar código' }}
            </template>
          </button>
        </div>

      </div>
    </Transition>

    <!-- ── Error ── -->
    <p v-if="err" role="alert" aria-live="assertive" class="error">{{ err }}</p>

  </div>
</template>

<style scoped>
/* ── Layout ── */
.login {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* ── Header ── */
.intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  margin-bottom: 2px;
}

.app-logo {
  height: 56px;
  width: auto;
  display: block;
  margin: 0 auto;
  animation: icon-spring 560ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: 80ms;
  image-rendering: -webkit-optimize-contrast;
}

@keyframes icon-spring {
  from { opacity: 0; transform: scale(0.78) rotate(-6deg); }
  to   { opacity: 1; transform: scale(1) rotate(0deg); }
}

.app-icon-glyph {
  color: #fff;
  font-size: 32px;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  font-weight: 300;
  letter-spacing: 0;
  user-select: none;
  /* Optical centering */
  margin-top: 1px;
}

.title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #1d1d1f;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
}

.subtitle {
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  color: #6e6e73;
  margin: 0;
  max-width: 280px;
}

.email-em {
  font-weight: 500;
  color: #3c3c43;
}

/* ── Notice ── */
.notice {
  font-size: 13px;
  background: rgba(10, 132, 255, 0.08);
  color: #0a84ff;
  border: 1px solid rgba(10, 132, 255, 0.2);
  border-radius: 10px;
  padding: 10px 14px;
  text-align: center;
  line-height: 1.45;
}

/* ── Form stack ── */
.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Demo button (modo apresentação) ── */
.demo-btn {
  width: 100%;
  height: 44px;
  background: #1d1d1f;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.1px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 150ms ease,
    transform 120ms var(--ease-spring);
}

.demo-btn:hover:not(:disabled) { background: #333336; }
.demo-btn:active:not(:disabled) { transform: scale(0.975); }
.demo-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Passkey button ── */
.passkey-btn {
  width: 100%;
  height: 44px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.09);
  border-radius: 12px;
  cursor: pointer;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    transform 120ms var(--ease-spring);
  font-family: inherit;
}

.passkey-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.14);
}

.passkey-btn:active:not(:disabled) {
  transform: scale(0.975);
  background: rgba(0, 0, 0, 0.10);
}

.passkey-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.passkey-btn-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  padding: 0 16px;
}

.passkey-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.passkey-icon svg {
  width: 20px;
  height: 20px;
}

.passkey-label {
  font-size: 17px;
  font-weight: 500;
  color: #1d1d1f;
  letter-spacing: -0.2px;
  display: flex;
  align-items: center;
}

.passkey-hint {
  font-size: 13px;
  color: #aeaeb2;
  text-align: center;
  margin-top: -2px;
  letter-spacing: -0.01em;
}

/* ── Divider ── */
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  font-weight: 500;
  color: #aeaeb2;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  margin: 4px 0 2px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 0.5px;
  background: rgba(60, 60, 67, 0.18);
}

/* ── Field ── */
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: #3c3c43;
  letter-spacing: -0.1px;
}

.text-input {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(0, 0, 0, 0.13);
  border-radius: 10px;
  padding: 0 14px;
  font-size: 17px;
  font-weight: 400;
  color: #1d1d1f;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  letter-spacing: -0.1px;
  outline: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    background 150ms ease;
  -webkit-appearance: none;
  appearance: none;
}

.text-input::placeholder {
  color: #c7c7cc;
  font-weight: 400;
}

.text-input:focus {
  border-color: #0a84ff;
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
  background: rgba(255, 255, 255, 0.85);
}

.otp-input {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.34em;
  text-align: center;
  font-size: 22px;
  font-weight: 500;
  padding: 0 20px;
}

/* ── Primary button ── */
.primary-btn {
  width: 100%;
  height: 44px;
  background: #0a84ff;
  border: none;
  border-radius: 10px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.1px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 150ms ease,
    opacity 150ms ease,
    transform 120ms var(--ease-spring);
}

.primary-btn:hover:not(:disabled):not(.primary-btn--disabled) {
  background: #0077ed;
}

.primary-btn:active:not(:disabled):not(.primary-btn--disabled) {
  transform: scale(0.975);
  background: #006edb;
}

.primary-btn--disabled,
.primary-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Secondary row ── */
.secondary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.ghost-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 8px;
  background: none;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 400;
  color: #0a84ff;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: -0.1px;
  transition:
    background 120ms ease,
    opacity 120ms ease;
}

.ghost-btn:hover:not(:disabled):not(.ghost-btn--disabled) {
  background: rgba(10, 132, 255, 0.08);
}

.ghost-btn:active:not(:disabled):not(.ghost-btn--disabled) {
  background: rgba(10, 132, 255, 0.14);
}

.ghost-btn--disabled,
.ghost-btn:disabled {
  color: #aeaeb2;
  cursor: default;
}

.ghost-btn-icon {
  width: 14px;
  height: 14px;
  margin-left: -2px;
  flex-shrink: 0;
}

/* ── Loading dots ── */
.passkey-loading-dots,
.btn-loading-dots,
.ghost-loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.passkey-loading-dots span,
.btn-loading-dots span,
.ghost-loading-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: dot-bounce 1.1s ease-in-out infinite;
}

.passkey-loading-dots span:nth-child(2),
.btn-loading-dots span:nth-child(2),
.ghost-loading-dots span:nth-child(2) { animation-delay: 0.15s; }

.passkey-loading-dots span:nth-child(3),
.btn-loading-dots span:nth-child(3),
.ghost-loading-dots span:nth-child(3) { animation-delay: 0.30s; }

@keyframes dot-bounce {
  0%, 80%, 100% { opacity: 0.35; transform: scale(0.75); }
  40%           { opacity: 1;    transform: scale(1); }
}

/* ── Error ── */
.error {
  font-size: 14px;
  background: rgba(255, 59, 48, 0.07);
  border: 1px solid rgba(255, 59, 48, 0.22);
  color: #d93141;
  border-radius: 10px;
  padding: 12px 14px;
  text-align: center;
  line-height: 1.45;
}

/* ── Step transition (directional slide) ── */
.step-enter-active,
.step-leave-active {
  transition:
    opacity 220ms cubic-bezier(0.2, 0, 0, 1),
    transform 220ms cubic-bezier(0.2, 0, 0, 1);
}
.step-enter-from {
  opacity: 0;
  transform: translateX(14px);
}
.step-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}

/* ── Accessibility ── */
@media (prefers-reduced-motion: reduce) {
  .app-logo {
    animation: none;
  }
  .step-enter-from,
  .step-leave-to {
    transform: none;
  }
  .passkey-loading-dots span,
  .btn-loading-dots span,
  .ghost-loading-dots span {
    animation: none;
    opacity: 0.6;
  }
}
</style>

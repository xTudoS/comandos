<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const auth = useAuth()
const err = ref('')
const busy = ref(false)

const route = useRoute()

function getRedirect() {
  const redirect = route.query.redirect as string
  return redirect && redirect.startsWith('/') ? redirect : '/trabalho'
}

/** Passkey resolvida (cadastrada ou pulada) → tour, se ainda não viu. */
async function goNext() {
  await navigateTo(await withOnboarding(getRedirect()))
}

async function onRegister() {
  err.value = ''
  busy.value = true
  try {
    await auth.registerPasskey()
    await goNext()
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message
    err.value = msg ?? 'Não foi possível cadastrar a passkey. Tente novamente.'
  } finally {
    busy.value = false
  }
}

async function onSkip() {
  await goNext()
}
</script>

<template>
  <div class="onboarding">
    <span class="onboarding-ico"><BaseIcon name="fingerprint" :size="26" /></span>
    <h1 class="onboarding-title">Cadastrar passkey deste dispositivo</h1>
    <p class="onboarding-desc">
      A passkey substitui a senha neste aparelho. Use Face ID, Touch ID ou PIN.
    </p>
    <div class="onboarding-actions">
      <button class="btn primary" type="button" :disabled="busy" @click="onRegister">
        {{ busy ? 'Cadastrando…' : 'Cadastrar passkey' }}
      </button>
      <button class="btn ghost" type="button" :disabled="busy" @click="onSkip">
        Agora não
      </button>
    </div>
    <p v-if="err" class="onboarding-err">
      <BaseIcon name="triangle-alert" :size="14" />{{ err }}
    </p>
  </div>
</template>

<style scoped>
.onboarding {
  max-width: 420px;
  margin: 0 auto;
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}
.onboarding-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 4px;
}
.onboarding-title {
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
}
.onboarding-desc {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-3);
  margin: 0;
}
.onboarding-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}
.onboarding-err {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--danger);
  margin: 0;
}
</style>

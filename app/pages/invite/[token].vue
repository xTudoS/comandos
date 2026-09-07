<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const name = ref('')
const err = ref('')
const busy = ref(false)

async function onAccept() {
  if (!token.value) {
    err.value = 'Token ausente.'
    return
  }
  busy.value = true
  err.value = ''
  try {
    const res = await $fetch<{ email: string }>(
      `/api/invitations/${token.value}/accept`,
      { method: 'POST', body: { name: name.value || undefined } },
    )
    // Hand off to the bootstrap OTP flow. The freshly-accepted user has no
    // passkey yet, so the guard's proceed branch fires naturally and the
    // user lands logged in; login.vue routes them to /onboarding/passkey.
    await navigateTo(`/login?retry=${encodeURIComponent(res.email)}`)
  } catch (e: unknown) {
    const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
    err.value = msg ?? 'Falha ao aceitar convite.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UContainer class="max-w-md py-12 space-y-4">
    <h1 class="text-xl font-semibold">Aceitar convite</h1>
    <p class="text-sm text-gray-600">
      Confirme seu nome para aceitar o convite. Em seguida você entrará com um código por email e
      cadastrará uma passkey neste dispositivo.
    </p>
    <input v-model="name" type="text" placeholder="Seu nome (opcional)" autocomplete="name" />
    <button class="btn primary" type="button" :disabled="busy" @click="onAccept" style="width:100%; justify-content:center;">
      {{ busy ? 'Aceitando…' : 'Aceitar convite' }}
    </button>
    <p v-if="err" class="text-red-600 text-sm">{{ err }}</p>
  </UContainer>
</template>

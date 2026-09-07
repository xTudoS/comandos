<script setup lang="ts">
import {
  DEFAULT_COUNTRY,
  formatNational,
  fromE164,
  phoneCountries,
  toE164,
  type PhoneCountry,
} from '~~/shared/phone'
import type { CountryCode } from 'libphonenumber-js'

/** `modelValue` é sempre E.164 (`+5511988887777`) — nunca o texto da tela. */
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const countries = phoneCountries()
const country = ref<CountryCode>(DEFAULT_COUNTRY)
const national = ref('')

// Reidrata a partir do valor de fora (voltar um passo, recarregar a página).
// Só quando o E.164 divergir do que este campo produziria, senão a máscara
// brigaria com a digitação a cada tecla.
watch(
  () => props.modelValue,
  (v) => {
    if (v === toE164(national.value, country.value)) return
    const parsed = fromE164(v)
    country.value = parsed.country
    national.value = parsed.national
  },
  { immediate: true },
)

function push() {
  emit('update:modelValue', toE164(national.value, country.value))
}

function onInput(value: string) {
  national.value = formatNational(value, country.value)
  push()
}

function onCountry(value: string) {
  country.value = value as CountryCode
  // Reformata: o mesmo número tem máscara diferente em cada país.
  national.value = formatNational(national.value, country.value)
  push()
}

const dialOf = (c: PhoneCountry) => `+${c.dial}`
const currentDial = computed(
  () => `+${countries.find((c) => c.code === country.value)?.dial ?? ''}`,
)
const options = computed(() =>
  countries.map((c) => ({ value: c.code, label: `${c.name} (${dialOf(c)})` })),
)
</script>

<template>
  <div class="phone">
    <!-- Select nativo: no mobile vira a roda do sistema, que é melhor que
         qualquer dropdown customizado para uma lista de ~250 itens. -->
    <div class="country">
      <select
        :value="country"
        class="country-select"
        aria-label="País do telefone"
        @change="onCountry(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <span class="country-face" aria-hidden="true">
        <span class="dial tabular">{{ currentDial }}</span>
        <BaseIcon name="chevron-down" :size="14" />
      </span>
    </div>

    <input
      :value="national"
      type="tel"
      inputmode="tel"
      autocomplete="tel-national"
      class="number tabular"
      placeholder="98888-7777"
      aria-label="Número de telefone"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @blur="$emit('update:modelValue', toE164(national, country))"
    />
  </div>
</template>

<style scoped>
/* Os dois controles vivem numa caixa só, como um campo único. A borda é do
   contêiner; o select e o input entram sem borda própria. */
.phone {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
  transition: border-color var(--dur-fast);
}
.phone:focus-within {
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.country {
  position: relative;
  display: flex;
  align-items: center;
  flex: none;
  border-right: 1px solid var(--border);
  background: var(--surface-hover);
}
/* O select real fica transparente por cima da face visível: assim o clique e o
   teclado usam o controle nativo, e o desenho continua nosso. */
.country-select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: 0;
}
.country-face {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  pointer-events: none;
  color: var(--text-2);
}
.dial {
  font-size: 14px;
  font-weight: 500;
}
.country-face :deep(svg) {
  color: var(--text-4);
}

.number {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text);
}
.number:focus {
  outline: none;
  box-shadow: none;
}
/* ≤780px o reset global sobe inputs para 16px (evita o zoom do iOS); a altura
   do campo acompanha para o alvo de toque não encolher. */
@media (max-width: 780px) {
  .number {
    font-size: 16px;
    padding: 12px;
  }
}
</style>

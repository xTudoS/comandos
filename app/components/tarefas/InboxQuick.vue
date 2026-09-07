<script setup lang="ts">
const emit = defineEmits<{ submit: [title: string, isMicro: boolean] }>()

const val = ref('')
const isMicro = ref(false)

function onKey(e: KeyboardEvent) {
  // `isComposing` ignora o Enter que confirma uma composição de IME/acento
  // (´ + a) — esse Enter não deve criar tarefa.
  if (e.key !== 'Enter' || e.isComposing) return
  const t = val.value.trim()
  if (!t) return
  // Limpa ANTES de emitir: se o handler do pai for lento (await), um segundo
  // Enter imediato já encontra o campo vazio e não duplica a tarefa.
  val.value = ''
  emit('submit', t, isMicro.value)
}
</script>

<template>
  <div class="inbox">
    <div class="inbox-head">Inbox · captura rápida</div>
    <div class="inbox-form">
      <input
        v-model="val"
        type="text"
        placeholder="O que precisa fazer? (Enter)"
        @keydown="onKey"
      />
      <button
        type="button"
        class="micro-chip"
        :class="{ on: isMicro }"
        :aria-pressed="isMicro"
        title="Criar como Micro (ação rápida)"
        @click="isMicro = !isMicro"
      >
        <BaseIcon name="zap" :size="13" />
        Micro
      </button>
    </div>
  </div>
</template>

<style scoped>
.inbox {
  margin-bottom: 18px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  padding: 10px 12px;
}
.inbox-head {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}
.inbox-form {
  display: flex;
  align-items: center;
  gap: 8px;
}
.inbox-form input {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--surface-alt);
  font-size: 13px;
}
.inbox-form input:focus {
  background: var(--surface);
}
.micro-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-3);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.micro-chip:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.micro-chip.on {
  background: color-mix(in srgb, var(--micro-bar) 12%, transparent);
  border-color: var(--micro-bar);
  color: var(--micro-bar);
}
</style>

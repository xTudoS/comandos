<script setup lang="ts">
import { HORIZONTES } from '~/utils/horizontes'

definePageMeta({ layout: 'auth' })

/**
 * Tour de boas-vindas.
 *
 * O que se ensina aqui são os **horizontes de tempo** e os dois eixos
 * (Trabalho e Vida) — que é a metáfora real do produto. "Comando" é só o nome:
 * não existe paleta de comandos, entidade "comando" nem DSL no app, e um tour
 * que prometesse isso ensinaria algo que não está lá.
 *
 * Roda uma vez por usuário (`users.onboarding_completed_at`). "Pular" carimba
 * igual — quem não quis ver não deve ser perguntado de novo a cada login.
 */
const route = useRoute()
const dest = computed(() => {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/trabalho'
})

// Os horizontes vêm de `~/utils/horizontes` para o tour não virar uma segunda
// fonte de verdade: mexeu lá, o conteúdo aqui acompanha.
const horizontes = HORIZONTES

type Step = {
  icon: string
  eyebrow: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    icon: 'compass',
    eyebrow: 'Boas-vindas',
    title: 'Dois eixos: Trabalho e Vida',
    body:
      'Trabalho reúne tarefas, projetos, metas, empresas e pagamentos. Vida acompanha ' +
      'seu check-in diário e o equilíbrio entre cinco áreas. A mesma tarefa pode viver ' +
      'nos dois — é assim que "terminar o relatório" e "dormir melhor" convivem na mesma tela.',
  },
  {
    icon: 'layers',
    eyebrow: 'A ideia central',
    title: 'Horizontes de tempo, não prioridades',
    body:
      'Toda tarefa entra num horizonte: quando ela precisa acontecer. Em vez de discutir ' +
      'se algo é "alta" ou "média" prioridade, você responde uma pergunta mais fácil — ' +
      'isso é dos próximos 7 dias, ou pode esperar 90?',
  },
  {
    icon: 'user-round-cog',
    eyebrow: 'Quem executa',
    title: 'CEO, Delego, Pessoal',
    body:
      'CEO é o que só você faz. Delego é o que sai da sua mão e vira follow-up com ' +
      'responsável e data. Pessoal é o que não é trabalho. O tipo muda a cor do cartão ' +
      'na agenda e no board, então dá para ler a carga da semana de longe.',
  },
  {
    icon: 'calendar-clock',
    eyebrow: 'O dia a dia',
    title: 'Agenda, atrasados e agendamento',
    body:
      'A agenda junta tarefas, follow-ups, metas e pagamentos numa linha do tempo só. ' +
      'O que venceu ganha marca de atraso e aparece na aba Atrasados, com o contador ' +
      'vermelho no menu. E o seu link de agendamento deixa outras pessoas marcarem nos ' +
      'seus horários livres — sem ver o que você tem marcado.',
  },
]

const step = ref(0)
const busy = ref(false)
const isLast = computed(() => step.value === STEPS.length - 1)
const current = computed(() => STEPS[step.value]!)

// Foco vai para o título a cada passo — mesma regra da página pública de
// agendamento: sem isso, quem navega por teclado ou leitor de tela fica preso
// no botão que acabou de sumir.
const heading = ref<HTMLElement | null>(null)
watch(step, async () => {
  await nextTick()
  heading.value?.focus()
})

/** Concluir e pular são a mesma ação para o servidor: não mostrar de novo. */
async function finish() {
  if (busy.value) return
  busy.value = true
  try {
    await $fetch('/api/auth/onboarding/complete', { method: 'POST' })
  } catch {
    // Falhar aqui só significa que o tour vai aparecer mais uma vez. Barrar a
    // entrada no app por causa disso seria muito pior.
  } finally {
    await navigateTo(dest.value)
  }
}

function next() {
  if (isLast.value) return finish()
  step.value += 1
}
</script>

<template>
  <div class="ob">
    <header class="ob-head">
      <span class="eyebrow">{{ current.eyebrow }}</span>
      <h1 ref="heading" class="title" tabindex="-1">{{ current.title }}</h1>
      <p class="body">{{ current.body }}</p>
    </header>

    <!-- O passo dos horizontes ganha a lista real, com os mesmos rótulos que o
         board usa. Ler o conceito e ver as faixas juntas ensina melhor. -->
    <ul v-if="step === 1" class="hz">
      <li v-for="h in horizontes" :key="h.id" class="hz-item" :class="h.section">
        <span class="hz-label">{{ h.label }}</span>
        <span class="hz-desc">{{ h.desc }}</span>
      </li>
      <li class="hz-item foco">
        <span class="hz-label">Micro</span>
        <span class="hz-desc">Ações de até ~30 min, em qualquer horizonte</span>
      </li>
    </ul>

    <div v-else class="ob-icon" aria-hidden="true">
      <BaseIcon :name="current.icon" :size="40" />
    </div>

    <nav class="dots" aria-label="Progresso do tour">
      <button
        v-for="(s, i) in STEPS"
        :key="s.title"
        type="button"
        class="dot"
        :class="{ on: i === step, done: i < step }"
        :aria-label="`Passo ${i + 1}: ${s.title}`"
        :aria-current="i === step ? 'step' : undefined"
        @click="step = i"
      />
    </nav>

    <div class="actions">
      <BaseButton variant="primary" :disabled="busy" @click="next">
        {{ isLast ? 'Começar a usar' : 'Continuar' }}
      </BaseButton>
      <BaseButton v-if="!isLast" variant="ghost" :disabled="busy" @click="finish">
        Pular
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.ob {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.ob-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.eyebrow {
  font-size: var(--fs-11);
  font-weight: var(--fw-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
.title {
  font-size: var(--fs-26);
  font-weight: var(--fw-bold);
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
}
.title:focus-visible {
  outline: none;
}
.body {
  font-size: var(--fs-15);
  line-height: 1.6;
  color: var(--text-3);
  margin: 0;
  max-width: 460px;
}

.ob-icon {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
}

.hz {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  width: 100%;
  max-width: 420px;
  text-align: left;
}
.hz-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
/* Foco x backlog: a barra da esquerda separa "o que está no radar" do "depois",
   que é a divisão que o board já faz. */
.hz-item.foco {
  border-left: 3px solid var(--accent);
}
.hz-item.backlog {
  border-left: 3px solid var(--border-strong);
}
.hz-label {
  font-size: var(--fs-14);
  font-weight: var(--fw-semibold);
  color: var(--text);
  flex: none;
  min-width: 92px;
}
.hz-desc {
  font-size: var(--fs-13);
  color: var(--text-3);
}

.dots {
  display: flex;
  gap: 8px;
}
.dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--border-strong);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.dot.done {
  background: var(--accent-soft);
}
.dot.on {
  background: var(--accent);
  transform: scale(1.35);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    transition: none;
  }
}
</style>

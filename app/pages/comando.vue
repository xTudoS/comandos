<script setup lang="ts">
/**
 * A página de prompt que alimenta o Comando.
 *
 * Conversa sobre as tarefas: recebe pergunta, consulta os dados por ferramenta,
 * responde o que está rolando e — com a escrita ligada — cria e edita.
 *
 * Nome: "Comando", nunca "assistente". No app, **assistente é sempre uma pessoa
 * humana** (`usePeople`, `settings/people`), e reusar a palavra aqui confundiria
 * duas coisas que não têm relação.
 */
type Step = { tool: string; input: Record<string, unknown>; error?: string }
type Turn = { role: 'user' | 'assistant'; content: string; steps?: Step[] }

const messages = ref<Turn[]>([])
const input = ref('')
const busy = ref(false)
const err = ref('')
const allowWrite = ref(false)
const scroller = ref<HTMLElement | null>(null)

const SUGESTOES = [
  'O que está rolando hoje?',
  'O que atrasou?',
  'Quantas tarefas tenho nos próximos 7 dias?',
  'Resuma minha semana',
]

/** Rótulos legíveis: "list_tasks" não diz nada para quem está lendo a tela. */
const TOOL_LABEL: Record<string, string> = {
  list_tasks: 'Consultou as tarefas',
  get_task: 'Abriu uma tarefa',
  get_agenda: 'Consultou a agenda',
  get_stats: 'Calculou o panorama',
  list_context: 'Consultou projetos e pessoas',
  create_task: 'Criou uma tarefa',
  update_task: 'Editou uma tarefa',
  complete_task: 'Concluiu uma tarefa',
  archive_task: 'Arquivou uma tarefa',
}

async function scrollToEnd() {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}

async function send(text?: string) {
  const content = (text ?? input.value).trim()
  if (!content || busy.value) return

  messages.value.push({ role: 'user', content })
  input.value = ''
  err.value = ''
  busy.value = true
  await scrollToEnd()

  try {
    const res = await $fetch<{
      text: string
      steps: Step[]
      truncated: boolean
    }>('/api/ai/chat', {
      method: 'POST',
      body: {
        // Só papel e conteúdo vão para o servidor — `steps` é enfeite de UI.
        messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
        allowWrite: allowWrite.value,
      },
    })
    messages.value.push({
      role: 'assistant',
      content: res.text || '(sem resposta)',
      steps: res.steps,
    })
  } catch (e: unknown) {
    err.value =
      (e as { data?: { error?: { message?: string } } })?.data?.error?.message ??
      'Não consegui responder agora.'
    // Tira o turno do usuário da lista: deixá-lo lá sugere que foi enviado e
    // respondido, e o próximo envio reenviaria a pergunta duplicada.
    messages.value.pop()
    input.value = content
  } finally {
    busy.value = false
    await scrollToEnd()
  }
}

function onKeydown(e: KeyboardEvent) {
  // Enter envia, Shift+Enter quebra linha — convenção de chat.
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="cmd">
    <PageHeader title="Comando" subtitle="Pergunte sobre suas tarefas, agenda e metas.">
      <template #actions>
        <BaseToggle v-model="allowWrite" label="Permitir criar e editar" />
      </template>
    </PageHeader>

    <div ref="scroller" class="stream">
      <BaseEmptyState
        v-if="!messages.length"
        icon="message-circle"
        message="Pergunte alguma coisa. Eu consulto suas tarefas antes de responder."
      >
        <div class="chips">
          <button v-for="s in SUGESTOES" :key="s" type="button" class="chip" @click="send(s)">
            {{ s }}
          </button>
        </div>
      </BaseEmptyState>

      <div v-for="(m, i) in messages" :key="i" class="turn" :class="m.role">
        <!-- O que a IA consultou/alterou, antes da resposta: é o que deixa a
             resposta auditável em vez de mágica. -->
        <ul v-if="m.steps?.length" class="steps">
          <li v-for="(s, j) in m.steps" :key="j" class="step" :class="{ err: s.error }">
            <BaseIcon :name="s.error ? 'triangle-alert' : 'check'" :size="12" />
            {{ TOOL_LABEL[s.tool] ?? s.tool }}
            <span v-if="s.error" class="step-err">{{ s.error }}</span>
          </li>
        </ul>
        <div class="bubble">{{ m.content }}</div>
      </div>

      <div v-if="busy" class="turn assistant">
        <div class="bubble thinking">
          <span class="dot" /><span class="dot" /><span class="dot" />
        </div>
      </div>
    </div>

    <p v-if="err" class="err" role="alert">
      <BaseIcon name="triangle-alert" :size="14" />{{ err }}
    </p>

    <form class="composer" @submit.prevent="send()">
      <BaseTextarea
        v-model="input"
        :rows="2"
        placeholder="O que está rolando hoje?"
        aria-label="Sua pergunta"
        @keydown="onKeydown"
      />
      <BaseButton type="submit" variant="primary" icon-left="send" :disabled="busy || !input.trim()">
        Enviar
      </BaseButton>
    </form>
  </div>
</template>

<style scoped>
.cmd {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}
.chip {
  font-size: var(--fs-13);
  color: var(--text-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 6px 14px;
  cursor: pointer;
}
.chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.turn {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 720px;
}
.turn.user {
  align-self: flex-end;
  align-items: flex-end;
}
.turn.assistant {
  align-self: flex-start;
}

.bubble {
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: var(--fs-14);
  line-height: 1.6;
  /* A resposta vem em texto puro com quebras de linha — preservá-las é o que
     faz uma lista de tarefas continuar parecendo uma lista. */
  white-space: pre-wrap;
}
.turn.user .bubble {
  background: var(--accent);
  color: var(--accent-fg);
}
.turn.assistant .bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-11);
  color: var(--text-3);
}
.step.err {
  color: var(--danger);
}
.step-err {
  font-style: italic;
}

.thinking {
  display: flex;
  gap: 4px;
  align-items: center;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  animation: blink 1.2s infinite ease-in-out;
}
.dot:nth-child(2) {
  animation-delay: 0.2s;
}
.dot:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}

.err {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-13);
  color: var(--danger);
  margin: 0;
}

.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.composer > :first-child {
  flex: 1;
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
    opacity: 0.6;
  }
}
</style>

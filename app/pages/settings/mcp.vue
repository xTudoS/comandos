<script setup lang="ts">
/**
 * Tokens do servidor MCP — emitir, copiar uma vez, revogar.
 *
 * O token cru só existe na resposta da criação; o banco guarda o sha256. Por
 * isso a tela guarda o valor em memória até o usuário fechar o aviso: não há
 * "ver de novo", e sumir com ele sem avisar seria uma armadilha.
 */
type TokenRow = {
  id: string
  name: string
  readOnly: boolean
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

const { show: toast } = useToast()
const { ask: askConfirm } = useConfirm()

const tokens = ref<TokenRow[]>([])
const loading = ref(false)
const err = ref('')

const novo = reactive({ name: '', readOnly: true })
const criando = ref(false)
/** Token recém-criado, em claro. Some ao fechar — e não volta. */
const revelado = ref<{ token: string; readOnly: boolean } | null>(null)

const siteUrl = computed(() =>
  import.meta.client ? window.location.origin.replace(/\/$/, '') : '',
)

const comando = computed(() =>
  revelado.value
    ? `claude mcp add --transport http comando ${siteUrl.value}/api/mcp \\\n  --header "Authorization: Bearer ${revelado.value.token}"`
    : '',
)

async function refresh() {
  loading.value = true
  err.value = ''
  try {
    tokens.value = (await $fetch<{ tokens: TokenRow[] }>('/api/mcp-tokens')).tokens
  } catch (e: unknown) {
    err.value = msgOf(e) ?? 'Falha ao carregar os tokens.'
  } finally {
    loading.value = false
  }
}

function msgOf(e: unknown): string | undefined {
  return (e as { data?: { error?: { message?: string } } })?.data?.error?.message
}

async function criar() {
  if (criando.value) return
  criando.value = true
  err.value = ''
  try {
    const res = await $fetch<{ token: string; readOnly: boolean }>('/api/mcp-tokens', {
      method: 'POST',
      body: { name: novo.name.trim(), readOnly: novo.readOnly },
    })
    revelado.value = { token: res.token, readOnly: res.readOnly }
    novo.name = ''
    await refresh()
  } catch (e: unknown) {
    err.value = msgOf(e) ?? 'Falha ao criar o token.'
  } finally {
    criando.value = false
  }
}

async function revogar(t: TokenRow) {
  const ok = await askConfirm({
    title: 'Revogar este token?',
    message: `Qualquer cliente usando "${t.name || 'sem nome'}" perde o acesso na hora. Não dá para desfazer.`,
    confirmLabel: 'Revogar',
    danger: true,
  })
  if (!ok) return
  try {
    await $fetch(`/api/mcp-tokens/${t.id}`, { method: 'DELETE' })
    await refresh()
    toast('Token revogado.')
  } catch (e: unknown) {
    err.value = msgOf(e) ?? 'Falha ao revogar.'
  }
}

async function copiar(text: string, label: string) {
  await navigator.clipboard.writeText(text)
  toast(`${label} copiado.`)
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

onMounted(refresh)
</script>

<template>
  <div class="mcp">
    <PageHeader
      title="Claude e MCP"
      subtitle="Conecte o Claude Code ou o Claude Desktop às suas tarefas."
    />

    <section class="card">
      <h2 class="card-title">Como funciona</h2>
      <p class="card-text">
        O Comando expõe suas tarefas como ferramentas MCP. Com um token abaixo, o Claude
        consegue consultar sua agenda, listar o que atrasou e — se você permitir escrita —
        criar e editar tarefas. Quem paga o modelo é o cliente, não este app.
      </p>
    </section>

    <section class="card">
      <h2 class="card-title">Novo token</h2>
      <div class="form">
        <BaseInput v-model="novo.name" placeholder="Onde vai usar (ex.: MacBook)" />
        <BaseToggle v-model="novo.readOnly" label="Somente leitura" />
        <BaseButton variant="primary" :disabled="criando" @click="criar">
          {{ criando ? 'Criando…' : 'Criar token' }}
        </BaseButton>
      </div>
      <p class="hint">
        Somente leitura é o padrão. Desligue apenas se quiser que o Claude crie e edite
        tarefas por você.
      </p>
    </section>

    <!-- Única chance de copiar. Deixar isso discreto seria uma armadilha. -->
    <section v-if="revelado" class="card reveal">
      <h2 class="card-title">
        <BaseIcon name="triangle-alert" :size="16" /> Copie agora — não dá para ver de novo
      </h2>
      <p class="card-text">
        Guardamos apenas um hash. Se perder este valor, revogue e crie outro.
        {{ revelado.readOnly ? 'Este token é somente leitura.' : 'Este token PODE criar e editar tarefas.' }}
      </p>
      <pre class="code">{{ revelado.token }}</pre>
      <div class="row">
        <BaseButton variant="secondary" icon-left="copy" @click="copiar(revelado!.token, 'Token')">
          Copiar token
        </BaseButton>
      </div>

      <p class="card-text">Para conectar no Claude Code:</p>
      <pre class="code">{{ comando }}</pre>
      <div class="row">
        <BaseButton variant="secondary" icon-left="copy" @click="copiar(comando, 'Comando')">
          Copiar comando
        </BaseButton>
        <BaseButton variant="ghost" @click="revelado = null">Já copiei</BaseButton>
      </div>
    </section>

    <p v-if="err" class="err" role="alert">
      <BaseIcon name="triangle-alert" :size="14" />{{ err }}
    </p>

    <section class="card">
      <h2 class="card-title">Tokens</h2>
      <div v-if="loading" class="muted">Carregando…</div>
      <BaseEmptyState v-else-if="!tokens.length" icon="key-round" message="Nenhum token ainda." />
      <ul v-else class="list">
        <li v-for="t in tokens" :key="t.id" class="item" :class="{ revoked: t.revokedAt }">
          <div class="item-main">
            <span class="item-name">{{ t.name || 'Sem nome' }}</span>
            <span class="badge" :class="t.readOnly ? 'ro' : 'rw'">
              {{ t.readOnly ? 'somente leitura' : 'leitura e escrita' }}
            </span>
            <span v-if="t.revokedAt" class="badge revoked">revogado</span>
          </div>
          <div class="item-meta">
            Criado em {{ fmt(t.createdAt) }} · Último uso: {{ fmt(t.lastUsedAt) }}
          </div>
          <BaseButton
            v-if="!t.revokedAt"
            variant="ghost"
            size="sm"
            class="danger"
            @click="revogar(t)"
          >
            Revogar
          </BaseButton>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.mcp {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card.reveal {
  border-color: var(--amber);
  background: var(--amber-bg);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-15);
  font-weight: var(--fw-semibold);
  color: var(--text);
  margin: 0;
}
.card-text {
  font-size: var(--fs-13);
  line-height: 1.6;
  color: var(--text-2);
  margin: 0;
}
.hint {
  font-size: var(--fs-12);
  color: var(--text-3);
  margin: 0;
}
.form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.form > :first-child {
  flex: 1;
  min-width: 200px;
}
.code {
  font-family: var(--font-mono);
  font-size: var(--fs-12);
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin: 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: 'main action' 'meta action';
  gap: 2px 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.item.revoked {
  opacity: 0.55;
}
.item-main {
  grid-area: main;
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-name {
  font-size: var(--fs-14);
  font-weight: var(--fw-medium);
  color: var(--text);
}
.item-meta {
  grid-area: meta;
  font-size: var(--fs-12);
  color: var(--text-3);
}
.item :deep(.danger) {
  grid-area: action;
  color: var(--danger);
}
.badge {
  font-size: var(--fs-11);
  font-weight: var(--fw-semibold);
  border-radius: var(--radius-pill);
  padding: 2px 10px;
}
.badge.ro {
  background: var(--surface-hover);
  color: var(--text-3);
}
.badge.rw {
  background: var(--amber-bg);
  color: var(--amber);
}
.badge.revoked {
  background: var(--danger-bg);
  color: var(--danger);
}
.muted {
  font-size: var(--fs-13);
  color: var(--text-3);
}
.err {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-13);
  color: var(--danger);
  margin: 0;
}
</style>

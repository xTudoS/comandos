<script setup lang="ts">
import { isAuthMarkerValid } from '~/lib/authMarker'

definePageMeta({ layout: 'public' })

useHead({
  title: 'Comando — Seu comando pessoal',
  meta: [
    {
      name: 'description',
      content:
        'Organize trabalho e vida em horizontes de tempo, acompanhe as áreas da sua vida e mantenha o foco. Funciona offline. Sem senha.',
    },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    },
  ],
})

// Prerender-safe: renderiza a landing estática no servidor; no cliente, se já
// houver sessão válida (marcador offline), manda direto pro app.
onMounted(() => {
  if (isAuthMarkerValid()) navigateTo('/trabalho', { replace: true })
})

const diferenciais = [
  {
    icon: 'wifi-off',
    tone: 'pink',
    titulo: 'Offline-first',
    texto: 'Seus dados vivem no seu dispositivo. Trabalhe sem internet; sincroniza quando você volta.',
  },
  {
    icon: 'key-round',
    tone: 'violet',
    titulo: 'Sem senhas',
    texto: 'Entre com passkey. Só você aprova novos dispositivos.',
  },
  {
    icon: 'refresh-cw',
    tone: 'green',
    titulo: 'Sempre em dia',
    texto: 'Alterações sincronizam entre seus aparelhos automaticamente.',
  },
]

// Cards curtos com mini-visual (grid superior).
const showcase = [
  {
    icon: 'layout-grid',
    tone: 'pink',
    titulo: 'Organize por tempo',
    texto: 'Distribua tarefas em 7, 30, 60 e 90 dias e arraste conforme a prioridade muda.',
    visual: 'bars',
  },
  {
    icon: 'heart-pulse',
    tone: 'violet',
    titulo: 'Áreas da vida',
    texto: 'Corpo, Mente, Relacionamentos, Recursos e Experiências — com check-in diário.',
    visual: 'rings',
  },
  {
    icon: 'calendar',
    tone: 'green',
    titulo: 'Sua semana num olhar',
    texto: 'Tarefas com data e hora viram blocos na agenda: dia, semana, mês ou timeline.',
    visual: 'week',
  },
]

// Linhas alternadas (features detalhadas).
const features = [
  {
    icon: 'layout-grid',
    tone: 'pink',
    titulo: 'Nem tudo é para hoje. Organize por tempo.',
    texto:
      'Distribua suas tarefas em 7, 30, 60 e 90 dias — mais Micro para ganhos rápidos e Hibernando para o que pode esperar. Arraste entre horizontes conforme a prioridade muda. Veja em board, lista, calendário ou timeline.',
  },
  {
    icon: 'heart-pulse',
    tone: 'violet',
    titulo: 'A média esconde as rachaduras.',
    texto:
      'Acompanhe cinco áreas — Corpo, Mente, Relacionamentos, Recursos e Experiências — com check-in diário e streak. Veja de relance qual área precisa de atenção enquanto as outras vão bem.',
  },
  {
    icon: 'target',
    tone: 'green',
    titulo: 'Do objetivo à ação.',
    texto:
      'Defina metas com prazo e categoria, e acompanhe o que está ativo, vencendo ou concluído. Em grid, board, calendário ou timeline.',
  },
  {
    icon: 'calendar',
    tone: 'pink',
    titulo: 'Sua semana, num olhar.',
    texto:
      'Tarefas com data e hora viram blocos na agenda. Dia, semana, mês ou timeline — com um lookahead dos próximos dias sempre à mão.',
  },
  {
    icon: 'file-text',
    tone: 'violet',
    titulo: 'Seu conhecimento, sempre à mão.',
    texto: 'Guarde playbooks, decisões, contatos e referências com busca instantânea.',
  },
]

const eAinda = [
  'Projetos',
  'Pagamentos',
  'Agendamentos públicos',
  'Delegação com trilha de auditoria',
  'Arquivo restaurável',
]
</script>

<template>
  <div class="landing">
    <!-- Header -->
    <header class="l-header">
      <div class="l-container l-header-inner">
        <img src="/logo-comando.svg" alt="Comando" class="l-logo" />
        <nav class="l-nav">
          <NuxtLink to="/login" class="l-nav-link">Entrar</NuxtLink>
          <NuxtLink to="/login" class="btn primary l-nav-cta">Começar agora</NuxtLink>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section class="l-hero l-container">
      <span class="l-pill l-pill-violet">Produtividade pessoal, do seu jeito</span>
      <h1 class="l-h1">
        Seu comando pessoal.<br />
        Trabalho e vida, <span class="hl">sob controle.</span>
      </h1>
      <p class="l-sub">
        Organize tudo o que importa em horizontes de tempo, acompanhe as áreas da sua vida e
        mantenha o foco. Funciona offline. Sem senha.
      </p>
      <div class="l-cta">
        <NuxtLink to="/login" class="btn primary btn-lg">
          Assuma o comando
          <BaseIcon name="arrow-right" :size="17" />
        </NuxtLink>
        <span class="l-micro">
          Acesso por passkey ou código — mais rápido, e funciona offline depois do primeiro uso.
        </span>
      </div>

      <!-- Visual do produto: mock do board + chips flutuantes -->
      <div class="l-hero-visual" aria-hidden="true">
        <div class="l-mock">
          <div class="l-mock-bar">
            <span class="dot" /><span class="dot" /><span class="dot" />
            <span class="l-mock-title">Trabalho</span>
          </div>
          <div class="l-mock-cols">
            <div
              v-for="h in ['7 dias', '30 dias', '60 dias', '90 dias']"
              :key="h"
              class="l-mock-col"
            >
              <span class="l-mock-col-h">{{ h }}</span>
              <span class="l-mock-card" />
              <span class="l-mock-card short" />
              <span class="l-mock-card" />
            </div>
          </div>
        </div>

        <!-- Chip: concluídas hoje -->
        <div class="l-chip l-chip-tasks">
          <div class="l-chip-ico pink"><BaseIcon name="check" :size="16" /></div>
          <div>
            <span class="l-chip-label">Concluídas hoje</span>
            <span class="l-chip-value">12 <em>+3</em></span>
          </div>
          <div class="l-chip-bars">
            <i style="height: 40%" /><i style="height: 70%" /><i style="height: 55%" />
            <i style="height: 100%" /><i style="height: 80%" />
          </div>
        </div>

        <!-- Chip: streak -->
        <div class="l-chip l-chip-streak">
          <div class="l-chip-ico violet"><BaseIcon name="flame" :size="16" /></div>
          <div>
            <span class="l-chip-label">Streak · Corpo</span>
            <span class="l-chip-value">24 dias</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Diferenciais -->
    <section class="l-container l-badges">
      <div v-for="d in diferenciais" :key="d.titulo" class="l-badge">
        <span class="l-ico" :class="d.tone"><BaseIcon :name="d.icon" :size="20" /></span>
        <div>
          <h3 class="l-badge-title">{{ d.titulo }}</h3>
          <p class="l-badge-text">{{ d.texto }}</p>
        </div>
      </div>
    </section>

    <!-- Showcase: intro + grid com mini-visuais -->
    <section class="l-container l-showcase">
      <div class="l-section-head">
        <span class="l-pill l-pill-pink">Tudo num só lugar</span>
        <h2 class="l-section-title">Cada tarefa merece o horizonte certo.</h2>
        <p class="l-section-sub">
          Do foco de hoje ao que pode esperar — Comando organiza, acompanha e mantém você no
          controle, sem depender da nuvem.
        </p>
      </div>

      <div class="l-grid">
        <article v-for="s in showcase" :key="s.titulo" class="l-card">
          <div class="l-card-visual" :class="s.visual">
            <!-- barras (horizontes) -->
            <template v-if="s.visual === 'bars'">
              <div class="v-bars">
                <i class="c7" style="height: 46%" />
                <i class="c30" style="height: 78%" />
                <i class="c60" style="height: 60%" />
                <i class="c90" style="height: 92%" />
              </div>
            </template>
            <!-- barras de progresso (áreas) -->
            <template v-else-if="s.visual === 'rings'">
              <div class="v-areas">
                <span><b style="width: 82%" class="a1" /></span>
                <span><b style="width: 64%" class="a2" /></span>
                <span><b style="width: 91%" class="a3" /></span>
                <span><b style="width: 48%" class="a4" /></span>
                <span><b style="width: 73%" class="a5" /></span>
              </div>
            </template>
            <!-- semana -->
            <template v-else>
              <div class="v-week">
                <span v-for="n in 7" :key="n" class="v-day" :class="{ on: n === 3 || n === 5 }">
                  <em v-if="n === 3" class="ev pink" />
                  <em v-if="n === 5" class="ev violet" />
                </span>
              </div>
            </template>
          </div>
          <span class="l-ico" :class="s.tone"><BaseIcon :name="s.icon" :size="18" /></span>
          <h3 class="l-card-title">{{ s.titulo }}</h3>
          <p class="l-card-text">{{ s.texto }}</p>
        </article>
      </div>
    </section>

    <!-- Features (linhas alternadas) -->
    <section class="l-container l-features">
      <article
        v-for="(f, i) in features"
        :key="f.titulo"
        class="l-feature"
        :class="{ alt: i % 2 === 1 }"
      >
        <div class="l-feature-media" :class="f.tone" aria-hidden="true">
          <span class="l-feature-icon" :class="f.tone"><BaseIcon :name="f.icon" :size="26" /></span>
          <span class="l-feature-line" />
          <span class="l-feature-line short" />
        </div>
        <div class="l-feature-body">
          <h2 class="l-feature-title">{{ f.titulo }}</h2>
          <p class="l-feature-text">{{ f.texto }}</p>
        </div>
      </article>
    </section>

    <!-- E ainda -->
    <section class="l-container">
      <div class="l-more">
        <span class="l-more-label">E ainda</span>
        <ul class="l-more-list">
          <li v-for="item in eAinda" :key="item">{{ item }}</li>
        </ul>
      </div>
    </section>

    <!-- Fechamento: faixa de CTA rosa -->
    <section class="l-container l-close-wrap">
      <div class="l-close">
        <div class="l-close-body">
          <h2 class="l-close-title">Assuma o comando do seu dia.</h2>
          <p class="l-close-text">
            Instale como app (PWA), entre com passkey e comece. Seus dados ficam com você — inclusive
            offline.
          </p>
          <NuxtLink to="/login" class="btn l-close-btn">
            Entrar
            <BaseIcon name="arrow-right" :size="17" />
          </NuxtLink>
        </div>
        <div class="l-close-stats" aria-hidden="true">
          <div class="l-stat">
            <span class="l-stat-num">100%</span>
            <span class="l-stat-label">Offline-first</span>
          </div>
          <div class="l-stat">
            <span class="l-stat-num">0</span>
            <span class="l-stat-label">Senhas para lembrar</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="l-footer l-container">
      <img src="/logo-comando.svg" alt="Comando" class="l-footer-logo" />
      <span class="l-footer-tag">Feito com foco.</span>
      <NuxtLink to="/login" class="l-footer-link">Entrar</NuxtLink>
    </footer>
  </div>
</template>

<style scoped>
/* ============================================================================
   Landing — linguagem visual "Milestone" (rosa + violeta + lavanda).
   Paleta escopada APENAS aqui: não repinta o app (que segue Apple-blue).
   ============================================================================ */
.landing {
  position: relative;
  z-index: 1;
  font-family: 'Plus Jakarta Sans', var(--font-sans);

  /* tokens locais */
  --pink: #e11d5e;
  --pink-hover: #c7154f;
  --pink-soft: #fce7ef;
  --violet: #6c5ce7;
  --violet-soft: #ece9fe;
  --green: #16a34a;
  --green-soft: #e6f6ec;
  --lav: #f6f4fe;
  --ink: #1a1626;
  --ink-2: #514c60;
  --ink-3: #8b8698;
  --card-border: #ece9f3;
  --card-shadow: 0 1px 2px rgba(26, 22, 38, 0.04), 0 12px 32px -14px rgba(76, 29, 149, 0.22);
}

.l-container {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding-inline: 24px;
}

/* pílula / eyebrow */
.l-pill {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  letter-spacing: 0.01em;
}
.l-pill-violet {
  color: var(--violet);
  background: var(--violet-soft);
}
.l-pill-pink {
  color: var(--pink);
  background: var(--pink-soft);
}

/* chips de ícone coloridos */
.l-ico {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 14px;
}
.l-ico.pink {
  color: var(--pink);
  background: var(--pink-soft);
}
.l-ico.violet {
  color: var(--violet);
  background: var(--violet-soft);
}
.l-ico.green {
  color: var(--green);
  background: var(--green-soft);
}

/* ── Header ── */
.l-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding-block: 14px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid rgba(236, 233, 243, 0.9);
}
.l-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.l-logo {
  height: 30px;
  width: auto;
  display: block;
}
.l-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.l-nav-link {
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 10px;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.l-nav-link:hover {
  color: var(--ink);
  background: var(--lav);
}

/* botão primário rosa (override local da .btn global, que é grafite) */
.landing .btn.primary {
  background: var(--pink);
  color: #fff;
  box-shadow: 0 1px 2px rgba(225, 29, 94, 0.25), 0 8px 20px -8px rgba(225, 29, 94, 0.5);
}
.landing .btn.primary:hover:not(:disabled) {
  background: var(--pink-hover);
}
.landing .btn.primary:active:not(:disabled) {
  background: var(--pink-hover);
}
.l-nav-cta {
  padding: 10px 16px;
  font-size: 14px;
  border-radius: 10px;
}
.btn-lg {
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 14px;
}

/* ── Hero ── */
.l-hero {
  text-align: center;
  padding-top: clamp(48px, 8vw, 96px);
  padding-bottom: 40px;
}
.l-h1 {
  margin: 20px auto 0;
  font-size: clamp(36px, 6.4vw, 66px);
  line-height: 1.04;
  letter-spacing: -0.035em;
  font-weight: 800;
  color: var(--ink);
  max-width: 15ch;
}
.l-h1 .hl {
  color: var(--pink);
}
.l-sub {
  margin: 22px auto 0;
  max-width: 58ch;
  font-size: clamp(16px, 2vw, 19px);
  line-height: 1.55;
  color: var(--ink-2);
}
.l-cta {
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.l-micro {
  font-size: 13px;
  color: var(--ink-3);
  max-width: 44ch;
}

/* ── Visual do hero ── */
.l-hero-visual {
  position: relative;
  margin: 60px auto 0;
  max-width: 900px;
}
.l-mock {
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 22px;
  box-shadow: var(--card-shadow);
  overflow: hidden;
  text-align: left;
}
.l-mock-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--card-border);
  background: #fbfaff;
}
.l-mock-bar .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e3dff0;
}
.l-mock-title {
  margin-left: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-3);
}
.l-mock-cols {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  padding: 22px;
}
.l-mock-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.l-mock-col-h {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  margin-bottom: 2px;
}
.l-mock-card {
  height: 46px;
  border-radius: 10px;
  background: #f6f4fb;
  border: 1px solid var(--card-border);
}
.l-mock-card.short {
  height: 32px;
}
.l-mock-col:nth-child(1) .l-mock-card {
  border-left: 3px solid var(--color-h-core7);
}
.l-mock-col:nth-child(2) .l-mock-card {
  border-left: 3px solid var(--color-h-core30);
}
.l-mock-col:nth-child(3) .l-mock-card {
  border-left: 3px solid var(--color-h-core60);
}
.l-mock-col:nth-child(4) .l-mock-card {
  border-left: 3px solid var(--color-h-core90);
}

/* chips flutuantes */
.l-chip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 14px;
  box-shadow: 0 12px 30px -10px rgba(76, 29, 149, 0.28);
}
.l-chip-ico {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}
.l-chip-ico.pink {
  color: var(--pink);
  background: var(--pink-soft);
}
.l-chip-ico.violet {
  color: var(--violet);
  background: var(--violet-soft);
}
.l-chip-label {
  display: block;
  font-size: 11px;
  color: var(--ink-3);
  font-weight: 500;
}
.l-chip-value {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}
.l-chip-value em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: var(--green);
  margin-left: 4px;
}
.l-chip-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 30px;
  margin-left: 2px;
}
.l-chip-bars i {
  width: 5px;
  border-radius: 4px;
  background: var(--pink);
  opacity: 0.85;
}
.l-chip-tasks {
  top: -26px;
  right: -18px;
  animation: floaty 6s ease-in-out infinite;
}
.l-chip-streak {
  bottom: -22px;
  left: -14px;
  animation: floaty 7s ease-in-out infinite reverse;
}

@keyframes floaty {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

/* ── Diferenciais ── */
.l-badges {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding-block: 56px 8px;
}
.l-badge {
  display: flex;
  gap: 14px;
  padding: 22px;
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 18px;
  box-shadow: var(--card-shadow);
}
.l-badge-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 4px;
}
.l-badge-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink-2);
}

/* ── Showcase ── */
.l-showcase {
  padding-block: 64px 8px;
}
.l-section-head {
  text-align: center;
  max-width: 640px;
  margin: 0 auto 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.l-section-title {
  font-size: clamp(28px, 4.4vw, 42px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.08;
  color: var(--ink);
}
.l-section-sub {
  font-size: 16px;
  line-height: 1.55;
  color: var(--ink-2);
  max-width: 52ch;
}

.l-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.l-card {
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 22px;
  box-shadow: var(--card-shadow);
  padding: 20px;
  transition: transform var(--dur-medium) var(--ease-out),
    box-shadow var(--dur-medium) var(--ease-out);
}
.l-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 1px 2px rgba(26, 22, 38, 0.04), 0 20px 40px -16px rgba(76, 29, 149, 0.32);
}
.l-card-visual {
  height: 128px;
  border-radius: 14px;
  background: linear-gradient(160deg, #faf8ff, #f3effe);
  border: 1px solid var(--card-border);
  margin-bottom: 18px;
  display: grid;
  place-items: center;
  padding: 18px;
}
.l-card .l-ico {
  margin-bottom: 12px;
}
.l-card-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 6px;
}
.l-card-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink-2);
}

/* mini-visual: barras */
.v-bars {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  height: 100%;
  width: 100%;
  justify-content: center;
}
.v-bars i {
  width: 26px;
  border-radius: 6px 6px 4px 4px;
}
.v-bars .c7 {
  background: var(--color-h-core7);
}
.v-bars .c30 {
  background: var(--color-h-core30);
}
.v-bars .c60 {
  background: var(--color-h-core60);
}
.v-bars .c90 {
  background: var(--color-h-core90);
}

/* mini-visual: áreas (barras de progresso) */
.v-areas {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.v-areas span {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: #e9e4f5;
  overflow: hidden;
}
.v-areas b {
  display: block;
  height: 100%;
  border-radius: 999px;
}
.v-areas .a1 {
  background: var(--color-h-core7);
}
.v-areas .a2 {
  background: var(--color-h-core30);
}
.v-areas .a3 {
  background: var(--color-h-core90);
}
.v-areas .a4 {
  background: var(--violet);
}
.v-areas .a5 {
  background: var(--pink);
}

/* mini-visual: semana */
.v-week {
  display: flex;
  gap: 8px;
  width: 100%;
  justify-content: center;
}
.v-day {
  position: relative;
  width: 26px;
  height: 62px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--card-border);
}
.v-day.on {
  background: #fbf5f8;
  border-color: #f4dbe6;
}
.v-day .ev {
  position: absolute;
  left: 4px;
  right: 4px;
  height: 16px;
  border-radius: 4px;
  top: 10px;
}
.v-day .ev.pink {
  background: var(--pink);
}
.v-day .ev.violet {
  background: var(--violet);
  top: 30px;
}

/* ── Features (linhas alternadas) ── */
.l-features {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-block: 64px 24px;
}
.l-feature {
  display: grid;
  grid-template-columns: 0.85fr 1fr;
  gap: 28px;
  align-items: center;
  padding: 26px;
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 22px;
  box-shadow: var(--card-shadow);
}
.l-feature.alt {
  grid-template-columns: 1fr 0.85fr;
}
.l-feature.alt .l-feature-media {
  order: 2;
}
.l-feature.alt .l-feature-body {
  order: 1;
}
.l-feature-media {
  position: relative;
  height: 180px;
  border-radius: 18px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  overflow: hidden;
}
.l-feature-media.pink {
  background: linear-gradient(155deg, #fdeef4, #fbe0ec);
}
.l-feature-media.violet {
  background: linear-gradient(155deg, #f0edfe, #e6e1fd);
}
.l-feature-media.green {
  background: linear-gradient(155deg, #e9f7ee, #dcf1e4);
}
.l-feature-icon {
  position: absolute;
  top: 22px;
  left: 22px;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 6px 16px -6px rgba(26, 22, 38, 0.2);
}
.l-feature-icon.pink {
  color: var(--pink);
}
.l-feature-icon.violet {
  color: var(--violet);
}
.l-feature-icon.green {
  color: var(--green);
}
.l-feature-line {
  height: 12px;
  width: 80%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
}
.l-feature-line.short {
  width: 55%;
}
.l-feature-title {
  font-size: clamp(20px, 2.6vw, 26px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--ink);
  margin-bottom: 10px;
}
.l-feature-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-2);
  max-width: 54ch;
}

/* ── E ainda ── */
.l-more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 26px 28px;
  background: var(--lav);
  border: 1px solid var(--card-border);
  border-radius: 22px;
  margin-top: 28px;
}
.l-more-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--violet);
}
.l-more-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.l-more-list li {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
  padding: 8px 14px;
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 999px;
}

/* ── Fechamento (faixa rosa) ── */
.l-close-wrap {
  padding-block: 64px 40px;
}
.l-close {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 32px;
  align-items: center;
  padding: clamp(32px, 5vw, 56px);
  border-radius: 22px;
  background: linear-gradient(125deg, #e11d5e 0%, #c7154f 100%);
  box-shadow: 0 30px 60px -24px rgba(199, 21, 79, 0.6);
  overflow: hidden;
}
.l-close-title {
  font-size: clamp(26px, 4vw, 40px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.08;
  color: #fff;
  margin-bottom: 14px;
}
.l-close-text {
  font-size: 16px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.92);
  max-width: 46ch;
  margin-bottom: 26px;
}
.l-close-btn {
  background: #fff;
  color: var(--pink);
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 700;
  border-radius: 14px;
}
.l-close-btn:hover:not(:disabled) {
  background: #fff;
  transform: translateY(-1px);
}
.l-close-stats {
  display: grid;
  gap: 14px;
}
.l-stat {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 18px;
  padding: 20px 22px;
  backdrop-filter: blur(4px);
}
.l-stat-num {
  display: block;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  line-height: 1;
}
.l-stat-label {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.88);
}

/* ── Footer ── */
.l-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-block: 30px 44px;
  border-top: 1px solid var(--card-border);
  color: var(--ink-3);
  font-size: 13px;
}
.l-footer-logo {
  height: 22px;
  width: auto;
  opacity: 0.85;
}
.l-footer-tag {
  color: var(--ink-3);
}
.l-footer-link {
  margin-left: auto;
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 600;
}
.l-footer-link:hover {
  color: var(--pink);
}

/* ── Responsivo ── */
@media (max-width: 860px) {
  .l-grid {
    grid-template-columns: 1fr;
    max-width: 420px;
    margin-inline: auto;
  }
  .l-feature,
  .l-feature.alt {
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 22px;
  }
  .l-feature.alt .l-feature-media,
  .l-feature.alt .l-feature-body {
    order: 0;
  }
  .l-close {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
@media (max-width: 640px) {
  .l-badges {
    grid-template-columns: 1fr;
  }
  .l-mock-cols {
    grid-template-columns: repeat(2, 1fr);
  }
  .l-chip-tasks {
    top: -18px;
    right: -6px;
    transform: scale(0.9);
  }
  .l-chip-streak {
    bottom: -14px;
    left: -6px;
    transform: scale(0.9);
  }
}

@media (prefers-reduced-motion: reduce) {
  .l-chip-tasks,
  .l-chip-streak {
    animation: none;
  }
  .l-card {
    transition: none;
  }
}
</style>

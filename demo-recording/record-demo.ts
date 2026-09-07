/**
 * Harness de gravação automatizada do webinar do Comando.
 *
 * Dirige a conta de DEMONSTRAÇÃO pelos beats do roteiro e GRAVA o vídeo (.webm)
 * automaticamente (Playwright). Cobre a parte de tela (beats 3–11). Narração e
 * segmentos de IA entram depois.
 *
 * Pré-requisitos (ver docs/apresentacao/producao.md):
 *   - App rodando: NUXT_PUBLIC_DEMO_MODE=1 NUXT_DEMO_BYPASS=1 pnpm dev
 *   - Conta demo semeada: pnpm db:seed:demo
 *   - Navegador do Playwright: pnpm exec playwright install chromium
 *
 * Uso:
 *   pnpm demo:record                # grava tudo (+ índice de timecodes)
 *   pnpm demo:record -- --only=9    # grava só o beat 9
 *   SPEED=1.5 pnpm demo:record      # 1.5x mais LENTO (padrão 1)
 *   BASE_URL=http://localhost:3000 pnpm demo:record
 *
 * Beats são tolerantes a falha: um seletor quebrado loga o erro e a gravação
 * segue. Ajuste seletores em demo-recording/selectors.ts.
 */
import { chromium, type Page, type BrowserContext } from '@playwright/test'
import { rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { S, ROUTES } from './selectors'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT_DIR = process.env.OUT_DIR ?? join('demo-recording', 'videos')
const SPEED = Number(process.env.SPEED ?? '1') || 1 // multiplicador (maior = mais lento)
const VIEWPORT = { width: 1920, height: 1080 }

const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const ONLY = onlyArg ? Number(onlyArg.split('=')[1]) : null

const t0 = Date.now()
function stamp(): string {
  const s = Math.floor((Date.now() - t0) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ── Helpers de ritmo (tudo escalado por SPEED) ───────────────────────────────
const ms = (n: number) => Math.round(n * SPEED)
const beatPause = (page: Page, n = 1600) => page.waitForTimeout(ms(n))
/** Pausa "de leitura" — deixa a tela respirar para o espectador absorver. */
const read = (page: Page, n = 3200) => page.waitForTimeout(ms(n))

/** Scroll suave para baixo e volta — bom para listas longas em vídeo. */
async function smoothScroll(page: Page, distance = 900) {
  const steps = 18
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps)
    await page.waitForTimeout(ms(90))
  }
  await page.waitForTimeout(ms(700))
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -distance / steps)
    await page.waitForTimeout(ms(70))
  }
}

/** Clica com tolerância (ignora se não achar — beats não devem morrer). */
async function tryClick(page: Page, role: 'button' | 'tab', name: RegExp | string, opts: { nth?: number; pause?: number } = {}) {
  try {
    const loc = page.getByRole(role, { name }).nth(opts.nth ?? 0)
    await loc.click({ timeout: 4000 })
    await beatPause(page, opts.pause ?? 1400)
    return true
  } catch {
    return false
  }
}

/** Fecha o modal global de tarefa de forma garantida (e espera o backdrop sumir). */
async function closeModal(page: Page) {
  const backdrop = page.locator(S.modalBackdrop)
  if ((await backdrop.count()) === 0) return
  try {
    await page.getByRole('button', { name: S.modalCloseButton }).first().click({ timeout: 2500 })
  } catch {
    await page.keyboard.press('Escape')
  }
  try {
    await backdrop.first().waitFor({ state: 'detached', timeout: 4000 })
  } catch {
    await page.keyboard.press('Escape')
  }
  await beatPause(page, 700)
}

async function goto(page: Page, route: string) {
  await closeModal(page)
  await page.goto(BASE_URL + route)
  await page.waitForLoadState('networkidle').catch(() => {})
  await read(page, 2200)
}

/** Executa um beat tolerando falhas, sempre fechando modal antes. */
async function beat(n: number, title: string, fn: () => Promise<void>, page: Page) {
  if (ONLY !== null && ONLY !== n) return
  console.log(`[${stamp()}] Beat ${n}: ${title}`)
  try {
    await closeModal(page)
    await fn()
  } catch (err) {
    console.warn(`  ⚠ Beat ${n} parcial: ${(err as Error).message}`)
  }
}

// ── Login ────────────────────────────────────────────────────────────────────
async function loginDemo(page: Page) {
  await page.goto(BASE_URL + ROUTES.login)
  await page.waitForLoadState('networkidle').catch(() => {})
  await read(page, 2000) // mostra a tela de login um instante
  await page.getByRole('button', { name: S.demoLoginButton }).click()
  // Espera de verdade: a URL muda E o /trabalho fica pronto (login tem latência).
  await page.waitForURL('**' + ROUTES.trabalho, { timeout: 25000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.getByRole('button', { name: S.readyMarker }).first().waitFor({ timeout: 20000 })
  await read(page, 2600)
}

// ── Beats ─────────────────────────────────────────────────────────────────
async function beat4_trabalho(page: Page) {
  await goto(page, ROUTES.trabalho)
  // 1) Passa pelas 4 visões
  for (const v of ['Lista', 'Board', 'Calendário', 'Timeline']) {
    await tryClick(page, 'tab', v, { pause: 1800 })
  }
  await tryClick(page, 'tab', 'Board', { pause: 1400 })
  // 2) Filtro por empresa (mostra e volta)
  try {
    const filtro = page.getByLabel('Filtrar por empresa')
    await filtro.selectOption({ label: 'Acme Holding' })
    await read(page, 2200)
    await filtro.selectOption({ label: 'Todas as empresas' })
    await beatPause(page, 1200)
  } catch { /* segue */ }
  // 3) Criação rápida inline (sem abrir o modal)
  try {
    const qa = page.getByPlaceholder(S.quickAddInput)
    await qa.click()
    await qa.fill('Preparar reunião de board')
    await beatPause(page, 900)
    await qa.press('Enter')
    await read(page, 2200)
  } catch { /* segue */ }
  // 4) Expande um card para mostrar detalhes/ações
  try {
    await page.getByText('Definir pricing do plano anual', { exact: false }).first().click()
    await read(page, 2600)
    await page.keyboard.press('Escape')
  } catch { /* segue */ }
  // 5) Conclui uma tarefa (UI otimista instantânea)
  await tryClick(page, 'button', S.concluirButton, { pause: 2200 })
  // 6) Panorâmica dos horizontes
  await smoothScroll(page, 1100)
}

async function beat5_detalhe(page: Page) {
  await goto(page, ROUTES.trabalho)
  // Abre a tarefa semeada (com checklist + anotações) e o modal de edição
  await page.getByText('Revisar fluxo de onboarding', { exact: false }).first().click()
  await beatPause(page, 900)
  await tryClick(page, 'button', S.editarButton, { pause: 1600 })
  // Checklist
  if (await tryClick(page, 'button', S.checklistTab, { pause: 1400 })) {
    try {
      const cl = page.getByPlaceholder(S.checklistItemInput).first()
      await cl.fill('Validar copy da terceira tela')
      await beatPause(page, 700)
      await cl.press('Enter')
      await read(page, 2200)
    } catch { /* segue */ }
  }
  // Anotações
  if (await tryClick(page, 'button', S.anotacoesTab, { pause: 1400 })) {
    try {
      const an = page.getByPlaceholder(S.anotacaoInput).first()
      await an.fill('Alinhado com o jurídico ✅')
      await beatPause(page, 700)
      await an.press('Enter')
      await read(page, 2200)
    } catch { /* segue */ }
  }
  // Histórico / auditoria
  await tryClick(page, 'button', S.historicoTab, { pause: 2600 })
  await closeModal(page)
}

async function beat6_agenda(page: Page) {
  await goto(page, ROUTES.agenda)
  await read(page, 2500)
  // Granularidade
  for (const g of ['Dia', 'Semana', 'Mês']) {
    await tryClick(page, 'tab', g, { pause: 2000 })
  }
  await tryClick(page, 'tab', 'Semana', { pause: 1200 })
  // Navega no tempo
  await tryClick(page, 'button', /^Próximo$/, { pause: 1800 })
  await tryClick(page, 'button', /^Anterior$/, { pause: 1600 })
  // Visão de calendário
  await tryClick(page, 'tab', 'Calendário', { pause: 2600 })
  await tryClick(page, 'tab', 'Timeline', { pause: 1500 })
}

async function beat7_metasProjetos(page: Page) {
  await goto(page, ROUTES.metas)
  // Filtros por status
  for (const t of ['Ativas', 'Vencendo (30d)', 'Vencidas', 'Todos']) {
    await tryClick(page, 'tab', t, { pause: 1800 })
  }
  // Abre o modal "Nova meta" só pra mostrar os campos, depois fecha
  if (await tryClick(page, 'button', /^Nova meta$/, { pause: 1800 })) {
    await read(page, 2400)
    await closeModal(page)
  }
  await smoothScroll(page, 700)
  // Projetos
  await goto(page, ROUTES.projetos)
  await smoothScroll(page, 900)
}

async function beat8_notasPagamentos(page: Page) {
  await goto(page, ROUTES.notas)
  // Filtros por tipo
  for (const t of ['Playbooks', 'Credenciais', 'Contatos', 'Decisões', 'Referências', 'Todos']) {
    await tryClick(page, 'tab', t, { pause: 1500 })
  }
  // Abre uma nota no leitor
  try {
    await page.getByText('Decisão: stack do App v2', { exact: false }).first().click()
    await read(page, 2600)
  } catch { /* segue */ }
  // Pagamentos
  await goto(page, ROUTES.pagamentos)
  await read(page, 2200)
  for (const t of ['Saídas', 'Entradas', 'Todos']) {
    await tryClick(page, 'tab', t, { pause: 1600 })
  }
  // Marca um pagamento como pago e reverte (mostra a mudança de status)
  try {
    const pay = page.getByRole('button', { name: /Marcar .* como (pago|recebido)/i }).first()
    await pay.click({ timeout: 4000 })
    await read(page, 2400)
  } catch { /* segue */ }
  await tryClick(page, 'tab', 'Extrato', { pause: 2400 })
  await tryClick(page, 'tab', 'Lista', { pause: 1200 })
}

async function beat9_vida(page: Page) {
  await goto(page, ROUTES.vida)
  await read(page, 3000) // anel de score + alerta
  await smoothScroll(page, 1100) // áreas: corpo, mente, relacionamentos, recursos, experiências
  // Abre o check-in diário para mostrar o formulário
  if (await tryClick(page, 'button', S.vidaEditarCheckin, { pause: 1800 })) {
    await read(page, 2400)
    await tryClick(page, 'button', S.salvarCheckin, { pause: 2200 })
  }
}

async function beat10_delegacao(page: Page) {
  await goto(page, ROUTES.trabalho)
  // Tarefa já semeada como delegada (selo de delegação)
  try {
    await page.getByText('Preparar apresentação da nova marca', { exact: false }).first().click()
    await read(page, 2200)
    // Abre o histórico para mostrar a auditoria da delegação
    await tryClick(page, 'button', S.editarButton, { pause: 1600 })
    await tryClick(page, 'button', S.historicoTab, { pause: 3000 })
    await closeModal(page)
  } catch { /* segue */ }
}

async function beat11_offline(page: Page, context: BrowserContext) {
  await goto(page, ROUTES.trabalho)
  await context.setOffline(true)
  await read(page, 1800)
  // Cria uma tarefa offline (quick-add inline)
  try {
    const qa = page.getByPlaceholder(S.quickAddInput)
    await qa.click()
    await qa.fill('Tarefa criada offline')
    await beatPause(page, 800)
    await qa.press('Enter')
    await read(page, 2000)
  } catch { /* segue */ }
  // Conclui também offline
  await tryClick(page, 'button', S.concluirButton, { pause: 1800 })
  // Mostra o chip de pendência
  try {
    await page.getByText(S.syncChip).first().waitFor({ timeout: 4000 })
    await read(page, 2200)
  } catch { /* segue */ }
  // Volta a ficar online e sincroniza sozinho
  await context.setOffline(false)
  await read(page, 4500)
}

// ── Orquestração ──────────────────────────────────────────────────────────
async function run() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  })
  // Esconde o overlay do Nuxt DevTools para não aparecer no vídeo.
  await context.addInitScript(() => {
    const css =
      '#nuxt-devtools-anchor,.nuxt-devtools-anchor,#nuxt-devtools-container,' +
      '.nuxt-devtools-frame,[data-v-inspector],#nuxt-devtools{display:none!important}'
    const add = () => {
      const s = document.createElement('style')
      s.textContent = css
      document.documentElement.appendChild(s)
    }
    if (document.documentElement) add()
    document.addEventListener('DOMContentLoaded', add)
  })

  const page = await context.newPage()

  console.log(`Gravando${ONLY !== null ? ` (só beat ${ONLY})` : ''} @ SPEED=${SPEED} → ${OUT_DIR}`)
  console.log(`App: ${BASE_URL}\n--- ÍNDICE DE TIMECODES ---`)

  await beat(3, 'Login & primeiro acesso', () => loginDemo(page), page)
  if (ONLY !== null && ONLY !== 3) await loginDemo(page) // garante sessão p/ beat isolado

  await beat(4, 'Trabalho: horizontes, visões, filtros, criar e concluir', () => beat4_trabalho(page), page)
  await beat(5, 'Detalhe: checklist, anotações e histórico', () => beat5_detalhe(page), page)
  await beat(6, 'Agenda: granularidade e navegação', () => beat6_agenda(page), page)
  await beat(7, 'Metas (filtros + nova) & Projetos', () => beat7_metasProjetos(page), page)
  await beat(8, 'Notas (tipos) & Pagamentos (status)', () => beat8_notasPagamentos(page), page)
  await beat(9, 'Módulo Vida: score, áreas e check-in', () => beat9_vida(page), page)
  await beat(10, 'Delegação & histórico/auditoria', () => beat10_delegacao(page), page)
  await beat(11, 'Offline + sincronização', () => beat11_offline(page, context), page)

  console.log('--- FIM ---')

  const video = page.video()
  await context.close()
  await browser.close()
  if (video) {
    const src = await video.path()
    const name = ONLY !== null ? `beat-${ONLY}.webm` : 'comando-demo-full.webm'
    try {
      await rename(src, join(OUT_DIR, name))
      console.log(`\nVídeo salvo: ${join(OUT_DIR, name)}`)
    } catch {
      console.log(`\nVídeo salvo em: ${src}`)
    }
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

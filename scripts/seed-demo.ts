/**
 * Semeia a conta de DEMONSTRAÇÃO usada para gravar o webinar (ver
 * docs/apresentacao/). Cria (ou reaproveita) um usuário `owner` sem passkey e
 * popula dados fictícios porém críveis em todas as áreas do app: empresas,
 * delegados, projetos, metas, tarefas (5 horizontes + flag Micro, com agenda/follow-up/
 * checklist/anotações), notas (5 tipos), pagamentos e o módulo Vida.
 *
 * Idempotente: cada execução APAGA as linhas da conta demo e re-semeia — então
 * é também o "reset entre takes". Inserts diretos via Drizzle (sem passar pelos
 * *Service.ts), de propósito, para não poluir o audit log.
 *
 * Uso:
 *   pnpm db:seed:demo            # cria/garante o usuário demo + (re)semeia tudo
 *   pnpm db:seed:demo --clear    # apaga os dados da conta demo, sem re-semear
 *
 * Requer DATABASE_URL e (opcional) DEMO_EMAIL / DEMO_NAME no ambiente.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as schema from '../server/db/schema'

const email = (process.env.DEMO_EMAIL ?? 'demo@comando.app').toLowerCase()
const name = process.env.DEMO_NAME ?? 'Demo Comando'
const clearOnly = process.argv.includes('--clear')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })

// ── Helpers de data ─────────────────────────────────────────────────────────
const today = new Date()
function dayStr(offset: number): string {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}
function ts(offsetDays: number): Date {
  const d = new Date(today)
  d.setDate(d.getDate() + offsetDays)
  return d
}

async function getOrCreateDemoUser(): Promise<string> {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)
  if (existing.length > 0) return existing[0].id
  const [created] = await db
    .insert(schema.users)
    .values({ email, name, role: 'owner', emailVerified: true })
    .returning()
  console.log(`Created demo user: ${created.email} (id=${created.id})`)
  return created.id
}

async function wipe(uid: string) {
  // tasks cascateia checklist_items e task_annotations.
  await db.delete(schema.tasks).where(eq(schema.tasks.ownerUserId, uid))
  await db.delete(schema.notes).where(eq(schema.notes.ownerUserId, uid))
  await db.delete(schema.payments).where(eq(schema.payments.ownerUserId, uid))
  await db.delete(schema.projects).where(eq(schema.projects.ownerUserId, uid))
  await db.delete(schema.goals).where(eq(schema.goals.ownerUserId, uid))
  await db.delete(schema.lifeCheckins).where(eq(schema.lifeCheckins.ownerUserId, uid))
  await db.delete(schema.lifeItems).where(eq(schema.lifeItems.ownerUserId, uid))
  await db.delete(schema.people).where(eq(schema.people.ownerUserId, uid))
  await db.delete(schema.companies).where(eq(schema.companies.ownerUserId, uid))
}

async function seed(uid: string) {
  // ── Empresas ──────────────────────────────────────────────────────────────
  const [acme, nimbus, lumen] = await db
    .insert(schema.companies)
    .values([
      { ownerUserId: uid, name: 'Acme Holding' },
      { ownerUserId: uid, name: 'Nimbus Tech' },
      { ownerUserId: uid, name: 'Studio Lumen' },
    ])
    .returning()

  // ── Pessoas / delegados (uma assistente) ───────────────────────────────────
  const [maria, joao, carla] = await db
    .insert(schema.people)
    .values([
      { ownerUserId: uid, name: 'Maria Silva', email: 'maria@exemplo.com', isAssistant: true },
      { ownerUserId: uid, name: 'João Pereira', email: 'joao@exemplo.com' },
      { ownerUserId: uid, name: 'Carla Mendes' },
    ])
    .returning()

  // ── Metas ───────────────────────────────────────────────────────────────
  const [metaApp, metaMrr, metaCorrida] = await db
    .insert(schema.goals)
    .values([
      {
        ownerUserId: uid,
        title: 'Lançar o App v2 até o fim do trimestre',
        description: 'Nova versão com onboarding e sincronização em tempo real.',
        category: 'product',
        companyId: nimbus.id,
        dueDate: dayStr(75),
      },
      {
        ownerUserId: uid,
        title: 'Dobrar a receita recorrente',
        description: 'De R$ 50k para R$ 100k de MRR.',
        category: 'company',
        companyId: acme.id,
        dueDate: dayStr(160),
      },
      {
        ownerUserId: uid,
        title: 'Correr uma meia-maratona',
        description: '21 km em menos de 2h.',
        category: 'personal',
        dueDate: dayStr(120),
      },
    ])
    .returning()

  // ── Projetos ───────────────────────────────────────────────────────────
  const [projApp, projRebrand, projFin] = await db
    .insert(schema.projects)
    .values([
      {
        ownerUserId: uid,
        name: 'App Mobile v2',
        category: 'product',
        companyId: nimbus.id,
        goalId: metaApp.id,
        notes: 'Beta fechado com 50 usuários antes do lançamento público.',
      },
      {
        ownerUserId: uid,
        name: 'Rebranding Studio Lumen',
        category: 'company',
        companyId: lumen.id,
        notes: 'Nova identidade visual + site.',
      },
      {
        ownerUserId: uid,
        name: 'Planejamento Financeiro 2026',
        category: 'general',
        subjectLabel: 'Foco',
        subjectValue: 'Reduzir custos fixos em 15%',
      },
    ])
    .returning()

  // ── Tarefas (espalhadas pelos 5 horizontes + flag Micro) ────────────────────
  const taskRows = [
    // core7 — foco imediato (7 dias)
    {
      title: 'Assinar contrato da Acme até sexta',
      description: 'Revisar cláusula de SLA antes de assinar.',
      horizon: 'core7', type: 'ceo', companyId: acme.id,
      scheduledDate: dayStr(2), scheduledTime: '10:00:00', durationMinutes: 30,
    },
    // core30 — foco
    {
      title: 'Revisar fluxo de onboarding do App v2',
      description: 'Validar as 3 primeiras telas com o time de produto.',
      horizon: 'core30', type: 'ceo', projectId: projApp.id,
      scheduledDate: dayStr(0), scheduledTime: '09:30:00', durationMinutes: 60,
    },
    {
      title: 'Fechar contrato com a Nimbus Tech',
      description: '', horizon: 'core30', type: 'ceo', companyId: nimbus.id,
      scheduledDate: dayStr(1), scheduledTime: '14:00:00', durationMinutes: 45,
      followupActive: true, followupDate: dayStr(4),
      followupHolderPersonId: joao.id, followupDescription: 'Confirmar assinatura',
    },
    {
      title: 'Preparar apresentação da nova marca',
      description: 'Deck para o cliente da Studio Lumen.',
      horizon: 'core30', type: 'delegate', delegatePersonId: carla.id,
      projectId: projRebrand.id, scheduledDate: dayStr(2), scheduledTime: '11:00:00',
      durationMinutes: 90,
    },
    {
      title: 'Treino longo de domingo (16 km)',
      description: '', horizon: 'core30', type: 'personal',
      goalId: metaCorrida.id, lifeArea: 'corpo', done: false,
    },
    // core60
    {
      title: 'Definir pricing do plano anual',
      description: 'Analisar elasticidade e churn.',
      horizon: 'core60', type: 'ceo', goalId: metaMrr.id, companyId: acme.id,
    },
    {
      title: 'Migrar landing page para o novo CMS',
      description: '', horizon: 'core60', type: 'delegate', delegatePersonId: joao.id,
      projectId: projRebrand.id,
    },
    // core90
    {
      title: 'Estruturar programa de indicação',
      description: 'Meta: 20% de novos clientes via indicação.',
      horizon: 'core90', type: 'ceo', goalId: metaMrr.id,
    },
    // Micro — tarefas rápidas (flag isMicro; horizonte continua livre)
    {
      title: 'Responder e-mail do investidor',
      description: '', horizon: 'core7', type: 'ceo', isMicro: true, done: true,
      completedAt: ts(-1),
    },
    {
      title: 'Aprovar reembolso da equipe',
      description: '', horizon: 'core7', type: 'delegate', isMicro: true,
      delegatePersonId: maria.id,
    },
    {
      title: 'Agendar dentista',
      description: '', horizon: 'core30', type: 'personal', isMicro: true,
      lifeArea: 'corpo',
    },
    // backlog (seção): hibernando
    {
      title: 'Pesquisar fornecedores de brindes',
      description: '', horizon: 'hibernating', type: 'delegate', delegatePersonId: carla.id,
    },
    {
      title: 'Ler "Measure What Matters"',
      description: '', horizon: 'hibernating', type: 'personal', lifeArea: 'mente',
    },
    // hibernating
    {
      title: 'Ideia: app companheiro para smartwatch',
      description: 'Reavaliar depois do lançamento do v2.',
      horizon: 'hibernating', type: 'ceo', projectId: projApp.id,
    },
    {
      title: 'Planejar viagem em família',
      description: '', horizon: 'hibernating', type: 'personal',
      lifeArea: 'relacionamentos',
    },
  ] as const

  const insertedTasks = await db
    .insert(schema.tasks)
    .values(
      taskRows.map((t) => ({
        ownerUserId: uid,
        createdByUserId: uid,
        ...t,
      })),
    )
    .returning({ id: schema.tasks.id, title: schema.tasks.title })

  const taskByTitle = new Map(insertedTasks.map((t) => [t.title, t.id]))

  // ── Checklist + anotações em uma tarefa de destaque ─────────────────────────
  const onboardingId = taskByTitle.get('Revisar fluxo de onboarding do App v2')!
  await db.insert(schema.checklistItems).values([
    { taskId: onboardingId, position: 0, text: 'Tela de boas-vindas', done: true, doneAt: ts(-1) },
    { taskId: onboardingId, position: 1, text: 'Criação de conta', done: true, doneAt: ts(0) },
    { taskId: onboardingId, position: 2, text: 'Importar dados', done: false },
    { taskId: onboardingId, position: 3, text: 'Tour guiado', done: false },
  ])
  await db.insert(schema.taskAnnotations).values([
    {
      taskId: onboardingId, authorUserId: uid,
      body: 'Time de design topou reduzir de 5 para 3 telas. 👍',
      createdAt: ts(-2),
    },
    {
      taskId: onboardingId, authorUserId: uid,
      body: 'Falta validar o copy da terceira tela com o jurídico.',
      createdAt: ts(0),
    },
  ])

  // ── Notas (5 tipos) ──────────────────────────────────────────────────────
  await db.insert(schema.notes).values([
    {
      ownerUserId: uid, type: 'playbook', title: 'Playbook de lançamento',
      body: 'Checklist de go-to-market: teaser → beta → imprensa → público.',
      projectId: projApp.id,
    },
    {
      ownerUserId: uid, type: 'credential', title: 'Acesso ao painel de analytics',
      body: 'Usuário: demo@analytics · Senha: (fictícia para a demo)',
      status: 'active',
    },
    {
      ownerUserId: uid, type: 'contact', title: 'Contato — Agência de PR',
      body: 'Renata Alves · renata@pragencia.com · (11) 99999-0000',
      companyId: lumen.id,
    },
    {
      ownerUserId: uid, type: 'decision', title: 'Decisão: stack do App v2',
      body: 'Optamos por offline-first com sincronização em tempo real.',
      projectId: projApp.id,
    },
    {
      ownerUserId: uid, type: 'reference', title: 'Referências de UI',
      body: 'Apple HIG, frosted glass, tipografia SF Pro.',
    },
  ])

  // ── Pagamentos (pendentes/pagos, despesa/receita, alguns "atrasados") ───────
  await db.insert(schema.payments).values([
    {
      ownerUserId: uid, description: 'Mensalidade de infraestrutura (Cloudflare)',
      amountCents: 48000, dueDate: dayStr(-3), kind: 'expense',
      recurrence: 'monthly', status: 'pending', companyId: nimbus.id,
    },
    {
      ownerUserId: uid, description: 'Honorários do contador',
      amountCents: 120000, dueDate: dayStr(5), kind: 'expense',
      recurrence: 'monthly', status: 'pending',
    },
    {
      ownerUserId: uid, description: 'Recebimento — cliente Studio Lumen',
      amountCents: 850000, dueDate: dayStr(10), kind: 'income',
      recurrence: 'none', status: 'pending', companyId: lumen.id,
    },
    {
      ownerUserId: uid, description: 'Assinatura de design (Figma)',
      amountCents: 9000, dueDate: dayStr(-10), kind: 'expense',
      recurrence: 'monthly', status: 'paid', paidAt: ts(-10),
    },
  ])

  // ── Vida ───────────────────────────────────────────────────────────────────
  const lifeItems: Array<{ area: 'corpo' | 'mente' | 'relacionamentos' | 'recursos' | 'experiencias'; name: string; value: number }> = [
    { area: 'corpo', name: 'Treino', value: 8 },
    { area: 'corpo', name: 'Sono', value: 6 },
    { area: 'corpo', name: 'Alimentação', value: 7 },
    { area: 'mente', name: 'Leitura', value: 5 },
    { area: 'mente', name: 'Meditação', value: 4 },
    { area: 'relacionamentos', name: 'Família', value: 9 },
    { area: 'relacionamentos', name: 'Amigos', value: 6 },
    { area: 'recursos', name: 'Finanças', value: 7 },
    { area: 'recursos', name: 'Carreira', value: 8 },
    { area: 'experiencias', name: 'Viagens', value: 3 },
    { area: 'experiencias', name: 'Hobbies', value: 5 },
  ]
  await db.insert(schema.lifeItems).values(
    lifeItems.map((it, i) => ({ ownerUserId: uid, sortOrder: i, ...it })),
  )

  const checkins = [
    { off: -4, sleepHours: 6.5, training: 'hard' as const, nutrition: 7, mood: 7, energy: 6 },
    { off: -3, sleepHours: 7.5, training: 'light' as const, nutrition: 8, mood: 8, energy: 8 },
    { off: -2, sleepHours: 5.5, training: 'none' as const, nutrition: 6, mood: 5, energy: 5 },
    { off: -1, sleepHours: 8.0, training: 'hard' as const, nutrition: 8, mood: 9, energy: 9 },
    { off: 0, sleepHours: 7.0, training: 'light' as const, nutrition: 7, mood: 8, energy: 7 },
  ]
  await db.insert(schema.lifeCheckins).values(
    checkins.map((c) => ({
      ownerUserId: uid,
      date: dayStr(c.off),
      sleepHours: c.sleepHours,
      training: c.training,
      nutrition: c.nutrition,
      mood: c.mood,
      energy: c.energy,
      note: '',
    })),
  )

  console.log(
    `Seeded demo data: ${insertedTasks.length} tarefas, 3 empresas, 3 pessoas, ` +
      `3 metas, 3 projetos, 5 notas, 4 pagamentos, ${lifeItems.length} itens de vida.`,
  )
}

const uid = await getOrCreateDemoUser()
await wipe(uid)
if (clearOnly) {
  console.log(`Cleared demo data for ${email}.`)
} else {
  await seed(uid)
  console.log(`Demo account ready: ${email}`)
}
await pool.end()

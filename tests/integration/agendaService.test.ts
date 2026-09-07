import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { companies, goals, payments, people, projects, tasks } from '~~/server/db/schema'
import { projectAgenda } from '~~/shared/agendaProject'
import { listAgenda, MAX_WINDOW_DAYS } from '~~/server/utils/agendaService'
import {
  archiveTask,
  completeTask,
  createTask,
  updateTask,
} from '~~/server/utils/tasksService'
import { createPerson } from '~~/server/utils/peopleService'
import { createGoal } from '~~/server/utils/goalsService'
import { createProject } from '~~/server/utils/projectsService'
import { createPayment, setPaymentPaid } from '~~/server/utils/paymentsService'
import { createCompany } from '~~/server/utils/companiesService'
import { useTestDb, seedUser } from './helpers'

const WINDOW = { from: '2026-05-01', to: '2026-05-31' }

async function linkPerson(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: { personId: string; userId: string },
) {
  await db.update(people).set({ linkedUserId: args.userId }).where(eq(people.id, args.personId))
}

describe('listAgenda — tarefas e follow-ups', () => {
  it('devolve o agendado na janela e exclui fora-da-janela e arquivado', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const inside = await createTask(db, {
        userId: alice,
        input: { title: 'in', scheduledDate: '2026-05-02' },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'antes', scheduledDate: '2026-04-30' },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'depois', scheduledDate: '2026-06-04' },
      })
      const arquivada = await createTask(db, {
        userId: alice,
        input: { title: 'arquivada', scheduledDate: '2026-05-02' },
      })
      await archiveTask(db, { userId: alice, taskId: arquivada.id, archived: true })

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items.map((i) => i.entityId)).toEqual([inside.id])
      expect(items[0]!.kind).toBe('task')
      expect(items[0]!.entityType).toBe('task')
    } finally {
      await pool.end()
    }
  })

  it('emite follow-up só quando followupActive', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, {
        userId: alice,
        input: { title: 'com-followup', followupActive: true, followupDate: '2026-05-02' },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'inativo', followupActive: false, followupDate: '2026-05-02' },
      })

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items).toHaveLength(1)
      expect(items[0]!.kind).toBe('followup')
      expect(items[0]!.entityId).toBe(t.id)
      expect(items[0]!.date).toBe('2026-05-02')
    } finally {
      await pool.end()
    }
  })

  it('follow-up é marco de dia todo — é o que a faixa "dia todo" desenha', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'cobrança',
          // Mesmo com hora no agendamento, o follow-up não herda hora.
          scheduledDate: '2026-05-02',
          scheduledTime: '10:00:00',
          followupActive: true,
          followupDate: '2026-05-05',
        },
      })
      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      const followup = items.find((i) => i.kind === 'followup')!
      expect(followup.time).toBeNull()
      expect(followup.allDay).toBe(true)
      expect(followup.shape).toBe('milestone')
      expect(followup.tone).toBe('fup')
    } finally {
      await pool.end()
    }
  })

  it('a mesma tarefa gera agendamento E follow-up, com ids distintos', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, {
        userId: alice,
        input: {
          title: 'dupla',
          scheduledDate: '2026-05-01',
          followupActive: true,
          followupDate: '2026-05-03',
        },
      })
      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items).toHaveLength(2)
      expect(items.map((i) => i.kind).sort()).toEqual(['followup', 'task'])
      expect(items.every((i) => i.entityId === t.id)).toBe(true)
      // Ids diferentes: os dois aparecem juntos na tela e `id` é a key do v-for.
      expect(new Set(items.map((i) => i.id)).size).toBe(2)
    } finally {
      await pool.end()
    }
  })

  it('normaliza a hora para HH:MM e deriva o fim a partir da duração', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'reunião',
          scheduledDate: '2026-05-02',
          scheduledTime: '10:00:00',
          durationMinutes: 90,
        },
      })
      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      // O Postgres devolve `time` com segundos; sem normalizar, a tela mostra
      // "10:00:00" (era o que timeline/mês/atrasados faziam).
      expect(items[0]!.time).toBe('10:00')
      expect(items[0]!.endTime).toBe('11:30')
      expect(items[0]!.endDate).toBe('2026-05-02')
      expect(items[0]!.shape).toBe('block')
      expect(items[0]!.allDay).toBe(false)
    } finally {
      await pool.end()
    }
  })

  it('bloco que passa da meia-noite empurra o endDate', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'virada',
          scheduledDate: '2026-05-02',
          scheduledTime: '23:00:00',
          durationMinutes: 120,
        },
      })
      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items[0]!.endDate).toBe('2026-05-03')
      expect(items[0]!.endTime).toBe('01:00')
    } finally {
      await pool.end()
    }
  })

  it('tarefa com data e sem hora é marco, não some', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: { title: 'sem hora', scheduledDate: '2026-05-02' },
      })
      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items[0]!.time).toBeNull()
      expect(items[0]!.allDay).toBe(true)
      expect(items[0]!.shape).toBe('milestone')
      expect(items[0]!.endTime).toBeNull()
    } finally {
      await pool.end()
    }
  })

  it('resolve o subtítulo como projeto → empresa → delegado', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const acme = await createCompany(db, { ownerUserId: alice, name: 'Acme' })
      const projeto = await createProject(db, {
        userId: alice,
        input: { name: 'Site novo', companyId: acme.id },
      })
      const maria = await createPerson(db, { ownerUserId: alice, name: 'Maria' })

      await createTask(db, {
        userId: alice,
        input: { title: 'com projeto', scheduledDate: '2026-05-01', projectId: projeto.id },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'com empresa', scheduledDate: '2026-05-02', companyId: acme.id },
      })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'com delegado',
          scheduledDate: '2026-05-03',
          type: 'delegate',
          delegatePersonId: maria.id,
        },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'sem nada', scheduledDate: '2026-05-04' },
      })

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items.map((i) => i.subtitle)).toEqual(['Site novo', 'Acme', 'Maria', null])
    } finally {
      await pool.end()
    }
  })
})

describe('listAgenda — metas', () => {
  it('mostra meta com prazo na janela, como marco de dia todo', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const meta = await createGoal(db, {
        userId: alice,
        input: { title: 'Contratar 3 engenheiros', dueDate: '2026-05-15' },
      })
      await createGoal(db, {
        userId: alice,
        input: { title: 'Fora da janela', dueDate: '2026-08-01' },
      })
      await createGoal(db, { userId: alice, input: { title: 'Sem prazo' } })

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        kind: 'goal',
        entityType: 'goal',
        entityId: meta.id,
        date: '2026-05-15',
        time: null,
        allDay: true,
        shape: 'milestone',
        tone: 'goal',
        done: false,
      })
    } finally {
      await pool.end()
    }
  })

  it('meta com todas as ações concluídas vem done — senão apareceria como atrasada', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const concluida = await createGoal(db, {
        userId: alice,
        input: { title: 'Concluída', dueDate: '2026-05-10' },
      })
      const emAndamento = await createGoal(db, {
        userId: alice,
        input: { title: 'Em andamento', dueDate: '2026-05-11' },
      })
      const semAcoes = await createGoal(db, {
        userId: alice,
        input: { title: 'Sem ações', dueDate: '2026-05-12' },
      })

      const a = await createTask(db, { userId: alice, input: { title: 'a', goalId: concluida.id } })
      await completeTask(db, { userId: alice, taskId: a.id, done: true })

      const b = await createTask(db, {
        userId: alice,
        input: { title: 'b', goalId: emAndamento.id },
      })
      await completeTask(db, { userId: alice, taskId: b.id, done: true })
      await createTask(db, { userId: alice, input: { title: 'c', goalId: emAndamento.id } })

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      const byId = new Map(items.map((i) => [i.entityId, i]))
      expect(byId.get(concluida.id)!.done).toBe(true)
      expect(byId.get(emAndamento.id)!.done).toBe(false)
      // Sem nenhuma ação vinculada não há progresso — não é "concluída".
      expect(byId.get(semAcoes.id)!.done).toBe(false)
    } finally {
      await pool.end()
    }
  })

  it('conta também as tarefas dos projetos vinculados à meta', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const meta = await createGoal(db, {
        userId: alice,
        input: { title: 'Lançar v2', dueDate: '2026-05-20' },
      })
      const projeto = await createProject(db, {
        userId: alice,
        input: { name: 'App v2', goalId: meta.id },
      })
      const t = await createTask(db, {
        userId: alice,
        input: { title: 'tarefa do projeto', projectId: projeto.id },
      })

      let { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items.find((i) => i.kind === 'goal')!.done).toBe(false)

      await completeTask(db, { userId: alice, taskId: t.id, done: true })
      ;({ items } = await listAgenda(db, { userId: alice, ...WINDOW }))
      expect(items.find((i) => i.kind === 'goal')!.done).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('meta arquivada não aparece', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const meta = await createGoal(db, {
        userId: alice,
        input: { title: 'Arquivada', dueDate: '2026-05-15' },
      })
      await db.update(goals).set({ archived: true }).where(eq(goals.id, meta.id))

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items).toEqual([])
    } finally {
      await pool.end()
    }
  })

  it('meta é estritamente do dono — não vaza para o delegado', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const mariaPerson = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
      await linkPerson(db, { personId: mariaPerson.id, userId: maria })

      await createGoal(db, { userId: alice, input: { title: 'da alice', dueDate: '2026-05-15' } })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'delegada',
          type: 'delegate',
          delegatePersonId: mariaPerson.id,
          scheduledDate: '2026-05-15',
        },
      })

      const { items } = await listAgenda(db, { userId: maria, ...WINDOW })
      // Maria vê a tarefa delegada, mas não a meta da Alice.
      expect(items.map((i) => i.kind)).toEqual(['task'])
    } finally {
      await pool.end()
    }
  })
})

describe('listAgenda — pagamentos', () => {
  it('mostra vencimento com valor, e separa entrada de saída pelo tom', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createPayment(db, {
        userId: alice,
        input: { description: 'Hospedagem', amountCents: 12_000, dueDate: '2026-05-05' },
      })
      await createPayment(db, {
        userId: alice,
        input: {
          description: 'Cliente Acme',
          amountCents: 1_500_000,
          dueDate: '2026-05-12',
          kind: 'income',
        },
      })

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items.map((i) => [i.title, i.tone, i.amountCents])).toEqual([
        ['Hospedagem', 'payment-out', 12_000],
        ['Cliente Acme', 'payment-in', 1_500_000],
      ])
      expect(items.every((i) => i.allDay && i.shape === 'milestone')).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('pagamento pago vem done', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const p = await createPayment(db, {
        userId: alice,
        input: { description: 'Figma', amountCents: 9_000, dueDate: '2026-05-15' },
      })
      let { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items[0]!.done).toBe(false)

      await setPaymentPaid(db, { userId: alice, paymentId: p.id, paid: true })
      ;({ items } = await listAgenda(db, { userId: alice, ...WINDOW }))
      expect(items.find((i) => i.entityId === p.id)!.done).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('marca a série recorrente com `recurring`', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createPayment(db, {
        userId: alice,
        input: {
          description: 'Assinatura',
          amountCents: 9_000,
          dueDate: '2026-05-15',
          recurrence: 'monthly',
        },
      })
      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items[0]!.recurring).toBe(true)
    } finally {
      await pool.end()
    }
  })
})

describe('listAgenda — ordenação, filtro e janela', () => {
  it('dia todo vem antes do que tem hora, e o dia manda sobre tudo', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: { title: 'dia 3 às 15h', scheduledDate: '2026-05-03', scheduledTime: '15:00:00' },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'dia 1 às 09h', scheduledDate: '2026-05-01', scheduledTime: '09:00:00' },
      })
      await createPayment(db, {
        userId: alice,
        input: { description: 'dia 1 sem hora', amountCents: 100, dueDate: '2026-05-01' },
      })

      const { items } = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(items.map((i) => i.title)).toEqual([
        'dia 1 sem hora',
        'dia 1 às 09h',
        'dia 3 às 15h',
      ])
    } finally {
      await pool.end()
    }
  })

  it('respeita o filtro de tipos', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: {
          title: 't',
          scheduledDate: '2026-05-02',
          followupActive: true,
          followupDate: '2026-05-03',
        },
      })
      await createGoal(db, { userId: alice, input: { title: 'm', dueDate: '2026-05-04' } })
      await createPayment(db, {
        userId: alice,
        input: { description: 'p', amountCents: 100, dueDate: '2026-05-05' },
      })

      const todos = await listAgenda(db, { userId: alice, ...WINDOW })
      expect(todos.items).toHaveLength(4)

      const soPagamento = await listAgenda(db, { userId: alice, ...WINDOW, kinds: ['payment'] })
      expect(soPagamento.items.map((i) => i.kind)).toEqual(['payment'])

      const semFollowup = await listAgenda(db, {
        userId: alice,
        ...WINDOW,
        kinds: ['task', 'goal'],
      })
      expect(semFollowup.items.map((i) => i.kind).sort()).toEqual(['goal', 'task'])
    } finally {
      await pool.end()
    }
  })

  it('rejeita data malformada, janela invertida e janela grande demais', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await expect(
        listAgenda(db, { userId: alice, from: 'notadate', to: '2026-05-01' }),
      ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      await expect(
        listAgenda(db, { userId: alice, from: '2026-05-03', to: '2026-05-01' }),
      ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      await expect(
        listAgenda(db, { userId: alice, from: '2026-01-01', to: '2030-01-01' }),
      ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      // A borda exata é aceita.
      await expect(
        listAgenda(db, { userId: alice, from: '2026-01-01', to: '2027-02-05' }),
      ).resolves.toBeTruthy()
      expect(MAX_WINDOW_DAYS).toBe(400)
    } finally {
      await pool.end()
    }
  })
})

describe('listAgenda — acesso', () => {
  it('delegado vê a tarefa delegada; dono vê as suas', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const mariaPerson = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
      await linkPerson(db, { personId: mariaPerson.id, userId: maria })

      const daAlice = await createTask(db, {
        userId: alice,
        input: { title: 'alice', scheduledDate: '2026-05-02' },
      })
      const delegada = await createTask(db, {
        userId: alice,
        input: {
          title: 'delegada',
          type: 'delegate',
          delegatePersonId: mariaPerson.id,
          scheduledDate: '2026-05-02',
        },
      })

      const agendaAlice = await listAgenda(db, { userId: alice, ...WINDOW })
      const agendaMaria = await listAgenda(db, { userId: maria, ...WINDOW })

      expect(agendaAlice.items.map((i) => i.entityId).sort()).toEqual(
        [daAlice.id, delegada.id].sort(),
      )
      expect(agendaMaria.items.map((i) => i.entityId)).toEqual([delegada.id])
      expect(agendaMaria.items[0]!.delegatePersonName).toBe('Maria')
    } finally {
      await pool.end()
    }
  })

  it('convidado vinculado vê a tarefa agendada', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const mariaPerson = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
      await linkPerson(db, { personId: mariaPerson.id, userId: maria })

      const convidada = await createTask(db, {
        userId: alice,
        input: {
          title: 'reunião',
          scheduledDate: '2026-05-02',
          participants: [{ personId: mariaPerson.id }],
        },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'só da alice', scheduledDate: '2026-05-02' },
      })

      const { items } = await listAgenda(db, { userId: maria, ...WINDOW })
      expect(items.map((i) => i.entityId)).toEqual([convidada.id])
    } finally {
      await pool.end()
    }
  })
})

describe('listAgenda — equivalência servidor × cliente', () => {
  it('a projeção do cliente sobre o cache produz exatamente os mesmos itens', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const acme = await createCompany(db, { ownerUserId: alice, name: 'Acme' })
      const projeto = await createProject(db, {
        userId: alice,
        input: { name: 'Site novo', companyId: acme.id },
      })
      const maria = await createPerson(db, { ownerUserId: alice, name: 'Maria' })

      await createTask(db, {
        userId: alice,
        input: {
          title: 'com hora',
          scheduledDate: '2026-05-02',
          scheduledTime: '10:00:00',
          durationMinutes: 90,
          projectId: projeto.id,
        },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'sem hora', scheduledDate: '2026-05-03', companyId: acme.id },
      })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'delegada com follow-up',
          type: 'delegate',
          delegatePersonId: maria.id,
          scheduledDate: '2026-05-04',
          followupActive: true,
          followupDate: '2026-05-06',
        },
      })
      const metaConcluida = await createGoal(db, {
        userId: alice,
        input: { title: 'Meta feita', dueDate: '2026-05-08', companyId: acme.id },
      })
      const acao = await createTask(db, {
        userId: alice,
        input: { title: 'ação', goalId: metaConcluida.id },
      })
      await completeTask(db, { userId: alice, taskId: acao.id, done: true })
      await createGoal(db, { userId: alice, input: { title: 'Meta aberta', dueDate: '2026-05-09' } })
      await createPayment(db, {
        userId: alice,
        input: {
          description: 'Hospedagem',
          amountCents: 12_000,
          dueDate: '2026-05-05',
          companyId: acme.id,
          recurrence: 'monthly',
        },
      })
      await createPayment(db, {
        userId: alice,
        input: {
          description: 'Cliente',
          amountCents: 1_500_000,
          dueDate: '2026-05-07',
          kind: 'income',
        },
      })

      const doServidor = await listAgenda(db, { userId: alice, ...WINDOW })

      // O cliente projeta a partir das listas que já mantém em cache. Aqui elas
      // são lidas cruas do banco, que é exatamente o que os endpoints de lista
      // devolvem para o cache.
      const taskRows = await db.select().from(tasks).where(eq(tasks.ownerUserId, alice))
      const goalRows = await db.select().from(goals).where(eq(goals.ownerUserId, alice))
      const paymentRows = await db.select().from(payments).where(eq(payments.ownerUserId, alice))
      const projectRows = await db.select().from(projects).where(eq(projects.ownerUserId, alice))
      const companyRows = await db.select().from(companies).where(eq(companies.ownerUserId, alice))
      const personRows = await db.select().from(people).where(eq(people.ownerUserId, alice))

      const nameById = (rows: { id: string; name: string }[]) => {
        const map = new Map(rows.map((r) => [r.id, r.name]))
        return (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null)
      }
      const personName = nameById(personRows)

      // O cliente sabe quais metas estão concluídas pelo mesmo critério (todas
      // as ações feitas) — aqui replicado a partir das tarefas em cache.
      const goalTaskTotals = new Map<string, { total: number; done: number }>()
      const projectGoal = new Map(projectRows.map((p) => [p.id, p.goalId]))
      for (const t of taskRows) {
        if (t.archived) continue
        const goalId = t.goalId ?? (t.projectId ? projectGoal.get(t.projectId) : null)
        if (!goalId) continue
        const acc = goalTaskTotals.get(goalId) ?? { total: 0, done: 0 }
        acc.total += 1
        if (t.done) acc.done += 1
        goalTaskTotals.set(goalId, acc)
      }

      const doCliente = projectAgenda({
        ...WINDOW,
        projectName: nameById(projectRows),
        companyName: nameById(companyRows),
        tasks: taskRows
          .filter((t) => !t.archived)
          .map((t) => ({
            id: t.id,
            title: t.title,
            type: t.type,
            done: t.done,
            scheduledDate: t.scheduledDate,
            scheduledTime: t.scheduledTime,
            durationMinutes: t.durationMinutes,
            followupActive: t.followupActive,
            followupDate: t.followupDate,
            projectId: t.projectId,
            companyId: t.companyId,
            delegatePersonId: t.delegatePersonId,
            delegatePersonName: personName(t.delegatePersonId),
          })),
        goals: goalRows
          .filter((g) => !g.archived)
          .map((g) => {
            const acc = goalTaskTotals.get(g.id)
            return {
              id: g.id,
              title: g.title,
              dueDate: g.dueDate,
              companyId: g.companyId,
              done: !!acc && acc.total > 0 && acc.total === acc.done,
            }
          }),
        payments: paymentRows
          .filter((p) => !p.archived)
          .map((p) => ({
            id: p.id,
            description: p.description,
            amountCents: p.amountCents,
            dueDate: p.dueDate,
            kind: p.kind,
            status: p.status,
            recurrence: p.recurrence,
            companyId: p.companyId,
          })),
      })

      expect(doCliente).toEqual(doServidor.items)
      // Sanidade: o cenário precisa ser rico o bastante para o teste valer algo.
      expect(doServidor.items.length).toBe(8)
      expect(new Set(doServidor.items.map((i) => i.kind))).toEqual(
        new Set(['task', 'followup', 'goal', 'payment']),
      )
    } finally {
      await pool.end()
    }
  })
})

describe('listAgenda — remarcação', () => {
  it('mudar scheduledDate move o item de janela', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, {
        userId: alice,
        input: { title: 'movendo', scheduledDate: '2026-05-02' },
      })
      let res = await listAgenda(db, { userId: alice, from: '2026-05-01', to: '2026-05-03' })
      expect(res.items[0]!.date).toBe('2026-05-02')

      await updateTask(db, { userId: alice, taskId: t.id, patch: { scheduledDate: '2026-05-10' } })
      res = await listAgenda(db, { userId: alice, from: '2026-05-01', to: '2026-05-03' })
      expect(res.items).toEqual([])

      res = await listAgenda(db, { userId: alice, from: '2026-05-09', to: '2026-05-11' })
      expect(res.items.map((i) => i.entityId)).toEqual([t.id])
    } finally {
      await pool.end()
    }
  })
})

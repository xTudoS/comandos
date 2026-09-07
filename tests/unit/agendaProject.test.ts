import { describe, it, expect } from 'vitest'
import {
  goalToAgendaItem,
  paymentToAgendaItem,
  projectAgenda,
  taskToAgendaItems,
  type GoalSource,
  type PaymentSource,
  type TaskSource,
} from '~~/shared/agendaProject'

const WINDOW = { from: '2026-05-01', to: '2026-05-31' }

function task(partial: Partial<TaskSource> & Pick<TaskSource, 'id'>): TaskSource {
  return {
    title: partial.id,
    type: 'ceo',
    done: false,
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: null,
    followupActive: false,
    followupDate: null,
    projectId: null,
    companyId: null,
    delegatePersonId: null,
    delegatePersonName: null,
    ...partial,
  }
}

function goal(partial: Partial<GoalSource> & Pick<GoalSource, 'id'>): GoalSource {
  return { title: partial.id, dueDate: null, companyId: null, done: false, ...partial }
}

function payment(partial: Partial<PaymentSource> & Pick<PaymentSource, 'id'>): PaymentSource {
  return {
    description: partial.id,
    amountCents: 1000,
    dueDate: '2026-05-10',
    kind: 'expense',
    status: 'pending',
    recurrence: 'none',
    companyId: null,
    ...partial,
  }
}

describe('taskToAgendaItems', () => {
  it('não emite nada quando nenhuma das duas datas cai na janela', () => {
    expect(
      taskToAgendaItems(task({ id: 't', scheduledDate: '2026-04-30' }), WINDOW),
    ).toEqual([])
    expect(taskToAgendaItems(task({ id: 't' }), WINDOW)).toEqual([])
  })

  it('testa cada data separadamente — follow-up na janela não arrasta agendamento de fora', () => {
    // Este é o caso que o SQL sozinho erraria: a linha entra pelo OR, mas só
    // uma das duas datas está dentro.
    const out = taskToAgendaItems(
      task({
        id: 't',
        scheduledDate: '2026-04-15',
        followupActive: true,
        followupDate: '2026-05-10',
      }),
      WINDOW,
    )
    expect(out.map((i) => i.kind)).toEqual(['followup'])
    expect(out[0]!.date).toBe('2026-05-10')
  })

  it('emite os dois quando as duas datas estão na janela, com ids distintos', () => {
    const out = taskToAgendaItems(
      task({
        id: 't',
        scheduledDate: '2026-05-02',
        followupActive: true,
        followupDate: '2026-05-09',
      }),
      WINDOW,
    )
    expect(out.map((i) => i.kind)).toEqual(['task', 'followup'])
    expect(out.map((i) => i.id)).toEqual(['t', 't:followup'])
    expect(out.every((i) => i.entityId === 't')).toBe(true)
  })

  it('ignora followupDate quando followupActive é falso', () => {
    const out = taskToAgendaItems(
      task({ id: 't', followupActive: false, followupDate: '2026-05-10' }),
      WINDOW,
    )
    expect(out).toEqual([])
  })

  it('o tom do agendamento é o tipo da tarefa; o do follow-up é sempre fup', () => {
    const out = taskToAgendaItems(
      task({
        id: 't',
        type: 'delegate',
        scheduledDate: '2026-05-02',
        followupActive: true,
        followupDate: '2026-05-09',
      }),
      WINDOW,
    )
    expect(out.map((i) => i.tone)).toEqual(['delegate', 'fup'])
  })

  it('resolve o subtítulo como projeto → empresa → delegado', () => {
    const ctx = {
      projectName: (id: string | null | undefined) => (id === 'p1' ? 'Site novo' : null),
      companyName: (id: string | null | undefined) => (id === 'c1' ? 'Acme' : null),
    }
    const withProject = taskToAgendaItems(
      task({ id: 'a', scheduledDate: '2026-05-02', projectId: 'p1', companyId: 'c1' }),
      WINDOW,
      ctx,
    )
    const withCompany = taskToAgendaItems(
      task({ id: 'b', scheduledDate: '2026-05-02', companyId: 'c1' }),
      WINDOW,
      ctx,
    )
    const withPerson = taskToAgendaItems(
      task({ id: 'c', scheduledDate: '2026-05-02', delegatePersonName: 'Maria' }),
      WINDOW,
      ctx,
    )
    const withNothing = taskToAgendaItems(task({ id: 'd', scheduledDate: '2026-05-02' }), WINDOW, ctx)

    expect(withProject[0]!.subtitle).toBe('Site novo')
    expect(withCompany[0]!.subtitle).toBe('Acme')
    expect(withPerson[0]!.subtitle).toBe('Maria')
    expect(withNothing[0]!.subtitle).toBeNull()
  })

  it('normaliza hora e deriva o fim pela duração', () => {
    const [item] = taskToAgendaItems(
      task({
        id: 't',
        scheduledDate: '2026-05-02',
        scheduledTime: '10:00:00',
        durationMinutes: 45,
      }),
      WINDOW,
    )
    expect(item!.time).toBe('10:00')
    expect(item!.endTime).toBe('10:45')
    expect(item!.shape).toBe('block')
  })

  it('tarefa com data e sem hora vira marco de dia todo', () => {
    const [item] = taskToAgendaItems(task({ id: 't', scheduledDate: '2026-05-02' }), WINDOW)
    expect(item!.allDay).toBe(true)
    expect(item!.shape).toBe('milestone')
    expect(item!.time).toBeNull()
  })
})

describe('goalToAgendaItem', () => {
  it('devolve null sem prazo ou com prazo fora da janela', () => {
    expect(goalToAgendaItem(goal({ id: 'm' }), WINDOW)).toBeNull()
    expect(goalToAgendaItem(goal({ id: 'm', dueDate: '2026-06-01' }), WINDOW)).toBeNull()
  })

  it('vira marco de dia todo com tom próprio', () => {
    const item = goalToAgendaItem(goal({ id: 'm', dueDate: '2026-05-15' }), WINDOW)!
    expect(item).toMatchObject({
      kind: 'goal',
      entityType: 'goal',
      shape: 'milestone',
      allDay: true,
      time: null,
      tone: 'goal',
    })
  })

  it('propaga a conclusão que quem chama resolveu', () => {
    const done = goalToAgendaItem(goal({ id: 'm', dueDate: '2026-05-15', done: true }), WINDOW)!
    expect(done.done).toBe(true)
  })
})

describe('paymentToAgendaItem', () => {
  it('separa entrada de saída pelo tom e carrega o valor', () => {
    const saida = paymentToAgendaItem(payment({ id: 'p' }), WINDOW)!
    const entrada = paymentToAgendaItem(
      payment({ id: 'q', kind: 'income', amountCents: 50_000 }),
      WINDOW,
    )!
    expect(saida.tone).toBe('payment-out')
    expect(entrada.tone).toBe('payment-in')
    expect(entrada.amountCents).toBe(50_000)
  })

  it('pago vira done', () => {
    expect(paymentToAgendaItem(payment({ id: 'p', status: 'paid' }), WINDOW)!.done).toBe(true)
    expect(paymentToAgendaItem(payment({ id: 'p' }), WINDOW)!.done).toBe(false)
  })

  it('marca a série recorrente', () => {
    expect(paymentToAgendaItem(payment({ id: 'p', recurrence: 'monthly' }), WINDOW)!.recurring).toBe(
      true,
    )
    expect(paymentToAgendaItem(payment({ id: 'p' }), WINDOW)!.recurring).toBe(false)
  })
})

describe('projectAgenda', () => {
  it('junta os três tipos, já ordenados', () => {
    const items = projectAgenda({
      ...WINDOW,
      tasks: [task({ id: 't', scheduledDate: '2026-05-10', scheduledTime: '14:00' })],
      goals: [goal({ id: 'm', dueDate: '2026-05-10' })],
      payments: [payment({ id: 'p', dueDate: '2026-05-05' })],
    })
    // Pagamento no dia 5; no dia 10, a meta (dia todo) vem antes da tarefa com hora.
    expect(items.map((i) => i.id)).toEqual(['p', 'm', 't'])
  })

  it('respeita o filtro de tipos, inclusive separando task de followup', () => {
    const input = {
      ...WINDOW,
      tasks: [
        task({
          id: 't',
          scheduledDate: '2026-05-02',
          followupActive: true,
          followupDate: '2026-05-09',
        }),
      ],
      goals: [goal({ id: 'm', dueDate: '2026-05-15' })],
      payments: [payment({ id: 'p' })],
    }
    expect(projectAgenda({ ...input, kinds: ['payment'] }).map((i) => i.id)).toEqual(['p'])
    expect(projectAgenda({ ...input, kinds: ['followup'] }).map((i) => i.id)).toEqual(['t:followup'])
    expect(projectAgenda({ ...input, kinds: ['task'] }).map((i) => i.id)).toEqual(['t'])
    expect(projectAgenda(input)).toHaveLength(4)
  })

  it('aguenta listas ausentes ou vazias', () => {
    expect(projectAgenda(WINDOW)).toEqual([])
    expect(projectAgenda({ ...WINDOW, tasks: [], goals: [], payments: [] })).toEqual([])
  })
})

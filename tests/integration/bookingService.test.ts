import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { bookingLinks, bookingRequests, tasks } from '~~/server/db/schema'
import {
  computeFreeRanges,
  createBookingRequest,
  decideBookingRequest,
  getOrCreateBookingLink,
  getRequestByRequesterToken,
  regenerateBookingToken,
  requesterConfirm,
  requesterDecline,
  syncBookingOnTaskReschedule,
  updateBookingLink,
} from '~~/server/utils/bookingService'
import { createTask } from '~~/server/utils/tasksService'
import { useTestDb, seedUser } from './helpers'

type Db = Awaited<ReturnType<typeof useTestDb>>['db']

/** Data bem no futuro: nenhum teste depende do relógio a não ser os que querem. */
const DATE = '2030-05-02'
const PREV = '2030-05-01'

function labels(ranges: { start: string; end: string }[]): string[] {
  return ranges.map((r) => `${r.start}–${r.end}`)
}

/** Solicitação crua, para montar cenários sem passar pela validação pública. */
async function seedRequest(
  db: Db,
  args: {
    ownerUserId: string
    date?: string
    time: string
    duration: number
    status?: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  },
) {
  const [row] = await db
    .insert(bookingRequests)
    .values({
      ownerUserId: args.ownerUserId,
      title: 'Conversa',
      requesterName: 'Visitante',
      requesterEmail: 'visitante@example.com',
      requesterWhatsapp: '11999999999',
      requestedDate: args.date ?? DATE,
      requestedTime: args.time,
      requestedDurationMinutes: args.duration,
      status: args.status ?? 'pending',
    })
    .returning()
  return row!
}

function publicInput(over: Partial<{ date: string; start: string; end: string }> = {}) {
  return {
    reason: 'Alinhamento',
    name: 'João Silva',
    email: 'joao@example.com',
    whatsapp: '11988887777',
    date: DATE,
    start: '10:00',
    end: '10:30',
    ...over,
  }
}

describe('getOrCreateBookingLink', () => {
  it('cria na primeira chamada e devolve a MESMA linha na segunda', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const first = await getOrCreateBookingLink(db, alice)
      const second = await getOrCreateBookingLink(db, alice)
      expect(second.id).toBe(first.id)
      expect(second.token).toBe(first.token)
      const rows = await db.select().from(bookingLinks).where(eq(bookingLinks.ownerUserId, alice))
      expect(rows).toHaveLength(1)
    } finally {
      await pool.end()
    }
  })

  it('duas chamadas concorrentes criam UM link só', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const [a, b] = await Promise.all([
        getOrCreateBookingLink(db, alice),
        getOrCreateBookingLink(db, alice),
      ])
      expect(a!.id).toBe(b!.id)
      const rows = await db.select().from(bookingLinks).where(eq(bookingLinks.ownerUserId, alice))
      expect(rows).toHaveLength(1)
    } finally {
      await pool.end()
    }
  })

  it('donos diferentes têm links diferentes', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const a = await getOrCreateBookingLink(db, alice)
      const b = await getOrCreateBookingLink(db, bob)
      expect(a.id).not.toBe(b.id)
      expect(a.token).not.toBe(b.token)
    } finally {
      await pool.end()
    }
  })

  it('regenerar troca o token e mantém a mesma linha', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const before = await getOrCreateBookingLink(db, alice)
      const after = await regenerateBookingToken(db, alice)
      expect(after.id).toBe(before.id)
      expect(after.token).not.toBe(before.token)
    } finally {
      await pool.end()
    }
  })
})

describe('computeFreeRanges', () => {
  it('dia sem nada devolve uma faixa de ponta a ponta', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const ranges = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(ranges)).toEqual(['00:00–23:59'])
    } finally {
      await pool.end()
    }
  })

  it('tarefa agendada abre um buraco', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'Reunião',
          scheduledDate: DATE,
          scheduledTime: '09:00',
          durationMinutes: 60,
        },
      })
      const ranges = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(ranges)).toEqual(['00:00–09:00', '10:00–23:59'])
    } finally {
      await pool.end()
    }
  })

  it('solicitação PENDENTE bloqueia — é a mudança de regra', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await seedRequest(db, { ownerUserId: alice, time: '14:00', duration: 30 })
      const ranges = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(ranges)).toEqual(['00:00–14:00', '14:30–23:59'])
    } finally {
      await pool.end()
    }
  })

  it('aceita bloqueia; recusada não', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await seedRequest(db, { ownerUserId: alice, time: '14:00', duration: 30, status: 'accepted' })
      await seedRequest(db, { ownerUserId: alice, time: '16:00', duration: 30, status: 'rejected' })
      const ranges = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(ranges)).toEqual(['00:00–14:00', '14:30–23:59'])
    } finally {
      await pool.end()
    }
  })

  it('tarefa arquivada, sem hora, ou de outro dono não bloqueia', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const arquivada = await createTask(db, {
        userId: alice,
        input: { title: 'x', scheduledDate: DATE, scheduledTime: '09:00', durationMinutes: 60 },
      })
      await db.update(tasks).set({ archived: true }).where(eq(tasks.id, arquivada.id))
      await createTask(db, {
        userId: alice,
        input: { title: 'dia todo', scheduledDate: DATE },
      })
      await createTask(db, {
        userId: bob,
        input: { title: 'do bob', scheduledDate: DATE, scheduledTime: '11:00', durationMinutes: 60 },
      })
      const ranges = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(ranges)).toEqual(['00:00–23:59'])
    } finally {
      await pool.end()
    }
  })

  it('compromisso da véspera que cruza a meia-noite ocupa a madrugada', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await createTask(db, {
        userId: alice,
        input: {
          title: 'Virada',
          scheduledDate: PREV,
          scheduledTime: '23:00',
          durationMinutes: 180,
        },
      })
      const ranges = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(ranges)).toEqual(['02:00–23:59'])
    } finally {
      await pool.end()
    }
  })

  it('esconde o passado quando a data é hoje, e não quando é outro dia', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      // 2030-05-02 15:00 em São Paulo (UTC-3) = 18:00Z.
      const now = new Date('2030-05-02T18:00:00Z')
      const hoje = await computeFreeRanges(db, { ownerUserId: alice, date: DATE, now })
      expect(labels(hoje)).toEqual(['15:00–23:59'])

      const amanha = await computeFreeRanges(db, {
        ownerUserId: alice,
        date: '2030-05-03',
        now,
      })
      expect(labels(amanha)).toEqual(['00:00–23:59'])
    } finally {
      await pool.end()
    }
  })
})

describe('createBookingRequest', () => {
  it('grava a duração derivada de início e fim', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const link = await getOrCreateBookingLink(db, alice)
      const created = await createBookingRequest(db, {
        token: link.token,
        input: publicInput({ start: '10:00', end: '11:15' }),
      })
      const [row] = await db
        .select()
        .from(bookingRequests)
        .where(eq(bookingRequests.id, created.requestId))
      expect(row!.requestedDurationMinutes).toBe(75)
      expect(String(row!.requestedTime).slice(0, 5)).toBe('10:00')
      expect(row!.status).toBe('pending')
      expect(created.ownerEmail).toBe('alice@example.com')
    } finally {
      await pool.end()
    }
  })

  it('recusa intervalo sobreposto a uma tarefa', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const link = await getOrCreateBookingLink(db, alice)
      await createTask(db, {
        userId: alice,
        input: { title: 'Ocupado', scheduledDate: DATE, scheduledTime: '10:00', durationMinutes: 60 },
      })
      await expect(
        createBookingRequest(db, { token: link.token, input: publicInput({ start: '10:30', end: '11:00' }) }),
      ).rejects.toThrow(/indisponível/i)
    } finally {
      await pool.end()
    }
  })

  it('recusa intervalo sobreposto a uma solicitação pendente alheia', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const link = await getOrCreateBookingLink(db, alice)
      await seedRequest(db, { ownerUserId: alice, time: '10:00', duration: 30 })
      await expect(
        createBookingRequest(db, { token: link.token, input: publicInput() }),
      ).rejects.toThrow(/indisponível/i)
    } finally {
      await pool.end()
    }
  })

  it('recusa intervalo que atravessa duas faixas — no meio está o compromisso', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const link = await getOrCreateBookingLink(db, alice)
      await createTask(db, {
        userId: alice,
        input: { title: 'Meio', scheduledDate: DATE, scheduledTime: '10:00', durationMinutes: 60 },
      })
      await expect(
        createBookingRequest(db, {
          token: link.token,
          input: publicInput({ start: '09:00', end: '12:00' }),
        }),
      ).rejects.toThrow(/indisponível/i)
    } finally {
      await pool.end()
    }
  })

  it('aceita o intervalo colado nos dois limites da faixa', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const link = await getOrCreateBookingLink(db, alice)
      await createTask(db, {
        userId: alice,
        input: { title: 'A', scheduledDate: DATE, scheduledTime: '09:00', durationMinutes: 60 },
      })
      await createTask(db, {
        userId: alice,
        input: { title: 'B', scheduledDate: DATE, scheduledTime: '12:00', durationMinutes: 60 },
      })
      const created = await createBookingRequest(db, {
        token: link.token,
        input: publicInput({ start: '10:00', end: '12:00' }),
      })
      expect(created.requestId).toBeTruthy()
    } finally {
      await pool.end()
    }
  })

  it('recusa link inativo e token inexistente', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const link = await getOrCreateBookingLink(db, alice)
      await updateBookingLink(db, { ownerUserId: alice, patch: { active: false } })
      await expect(
        createBookingRequest(db, { token: link.token, input: publicInput() }),
      ).rejects.toThrow(/indisponível/i)
      await expect(
        createBookingRequest(db, { token: 'nao-existe', input: publicInput() }),
      ).rejects.toThrow(/indisponível/i)
    } finally {
      await pool.end()
    }
  })

  it('sob concorrência na mesma faixa, só uma passa', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const link = await getOrCreateBookingLink(db, alice)
      const results = await Promise.allSettled([
        createBookingRequest(db, { token: link.token, input: publicInput() }),
        createBookingRequest(db, { token: link.token, input: publicInput() }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    } finally {
      await pool.end()
    }
  })
})

describe('decideBookingRequest', () => {
  it('o aceite cria a tarefa com a duração da PRÓPRIA solicitação', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      // Duração sugerida do link propositalmente diferente da pedida: é o valor
      // que a implementação antiga usava, e usar ele aqui seria a regressão.
      await updateBookingLink(db, { ownerUserId: alice, patch: { defaultDurationMinutes: 30 } })
      const req = await seedRequest(db, { ownerUserId: alice, time: '10:00', duration: 90 })

      const { request } = await decideBookingRequest(db, {
        ownerUserId: alice,
        requestId: req.id,
        decision: 'accepted',
      })
      expect(request.status).toBe('accepted')

      const [task] = await db.select().from(tasks).where(eq(tasks.id, request.createdTaskId!))
      expect(task!.durationMinutes).toBe(90)
      expect(String(task!.scheduledTime).slice(0, 5)).toBe('10:00')
    } finally {
      await pool.end()
    }
  })

  it('aceite sem link de origem ainda cria tarefa com duração', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      // bookingLinkId fica NULL — link apagado, FK ON DELETE SET NULL.
      const req = await seedRequest(db, { ownerUserId: alice, time: '08:00', duration: 45 })
      const { request } = await decideBookingRequest(db, {
        ownerUserId: alice,
        requestId: req.id,
        decision: 'accepted',
      })
      const [task] = await db.select().from(tasks).where(eq(tasks.id, request.createdTaskId!))
      expect(task!.durationMinutes).toBe(45)
    } finally {
      await pool.end()
    }
  })

  it('a recusa não cria tarefa e a segunda decisão falha', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const req = await seedRequest(db, { ownerUserId: alice, time: '10:00', duration: 30 })
      const { request } = await decideBookingRequest(db, {
        ownerUserId: alice,
        requestId: req.id,
        decision: 'rejected',
      })
      expect(request.createdTaskId).toBeNull()
      await expect(
        decideBookingRequest(db, {
          ownerUserId: alice,
          requestId: req.id,
          decision: 'accepted',
        }),
      ).rejects.toThrow(/já foi decidida/i)
    } finally {
      await pool.end()
    }
  })
})

// ── Ciclo do solicitante: confirmar / desmarcar pelo link do email ──────────

describe('ações do solicitante pelo token', () => {
  /** Aceita e devolve o token cru — o ponto de partida de quase todo teste daqui. */
  async function aceitar(db: Db, ownerUserId: string, over: { time?: string; duration?: number } = {}) {
    const req = await seedRequest(db, {
      ownerUserId,
      time: over.time ?? '10:00',
      duration: over.duration ?? 30,
    })
    const result = await decideBookingRequest(db, {
      ownerUserId,
      requestId: req.id,
      decision: 'accepted',
    })
    return result
  }

  it('o aceite emite token; a recusa não', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const aceito = await aceitar(db, alice)
      expect(aceito.requesterToken).toBeTruthy()

      const outro = await seedRequest(db, { ownerUserId: alice, time: '14:00', duration: 30 })
      const recusado = await decideBookingRequest(db, {
        ownerUserId: alice,
        requestId: outro.id,
        decision: 'rejected',
      })
      expect(recusado.requesterToken).toBeNull()
    } finally {
      await pool.end()
    }
  })

  it('o token guardado é o HASH, não o valor cru', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { request, requesterToken } = await aceitar(db, alice)
      const [row] = await db
        .select()
        .from(bookingRequests)
        .where(eq(bookingRequests.id, request.id))
      expect(row!.requesterTokenHash).toBeTruthy()
      expect(row!.requesterTokenHash).not.toBe(requesterToken)
      expect(row!.requesterTokenHash).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      await pool.end()
    }
  })

  it('a visão pública não expõe dono nem token', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { requesterToken } = await aceitar(db, alice)
      const view = await getRequestByRequesterToken(db, requesterToken!)

      expect(view).toMatchObject({ date: DATE, time: '10:00', durationMinutes: 30 })
      expect(view.status).toBe('accepted')
      expect(view.confirmed).toBe(false)
      // O contrato do payload: nada de identificador nem email do dono.
      expect(Object.keys(view)).not.toContain('ownerUserId')
      expect(JSON.stringify(view)).not.toContain('alice@example.com')
      expect(JSON.stringify(view)).not.toContain(requesterToken)
    } finally {
      await pool.end()
    }
  })

  it('token inexistente e token expirado são recusados', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      await expect(getRequestByRequesterToken(db, 'nao-existe')).rejects.toThrow(/inválido/i)

      const { request, requesterToken } = await aceitar(db, alice)
      await db
        .update(bookingRequests)
        .set({ requesterTokenExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(bookingRequests.id, request.id))
      await expect(getRequestByRequesterToken(db, requesterToken!)).rejects.toThrow(/expirou/i)
    } finally {
      await pool.end()
    }
  })

  it('confirmar carimba, é idempotente e NÃO queima o token', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { requesterToken } = await aceitar(db, alice)

      const um = await requesterConfirm(db, requesterToken!)
      expect(um.confirmed).toBe(true)
      // Confirmar de novo não explode — e o link continua valendo para desmarcar.
      const dois = await requesterConfirm(db, requesterToken!)
      expect(dois.confirmed).toBe(true)
      expect(dois.status).toBe('accepted')
    } finally {
      await pool.end()
    }
  })

  it('desmarcar cancela, ARQUIVA a tarefa e devolve o horário para as faixas livres', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { request, requesterToken } = await aceitar(db, alice)
      expect(request.createdTaskId).toBeTruthy()

      // Com o aceite de pé, das 10:00 às 10:30 está ocupado.
      const ocupado = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(ocupado)).not.toContain('00:00–23:59')

      const out = await requesterDecline(db, requesterToken!)
      expect(out.request.status).toBe('cancelled')
      expect(out.taskArchived).toBe(true)
      expect(out.ownerEmail).toBe('alice@example.com')

      const [task] = await db.select().from(tasks).where(eq(tasks.id, request.createdTaskId!))
      // Arquivada, não apagada: continua existindo para /arquivo.
      expect(task).toBeTruthy()
      expect(task!.archived).toBe(true)

      // E o horário volta a ficar livre sem nenhum passo extra.
      const livre = await computeFreeRanges(db, { ownerUserId: alice, date: DATE })
      expect(labels(livre)).toEqual(['00:00–23:59'])
    } finally {
      await pool.end()
    }
  })

  it('desmarcar queima o token — o mesmo link não serve duas vezes', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { requesterToken } = await aceitar(db, alice)
      await requesterDecline(db, requesterToken!)
      await expect(requesterDecline(db, requesterToken!)).rejects.toThrow(/inválido/i)
      await expect(getRequestByRequesterToken(db, requesterToken!)).rejects.toThrow(/inválido/i)
    } finally {
      await pool.end()
    }
  })

  it('remarcar sincroniza a solicitação, zera a confirmação e invalida o link antigo', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { request, requesterToken } = await aceitar(db, alice)
      await requesterConfirm(db, requesterToken!)

      const moved = await syncBookingOnTaskReschedule(db, {
        taskId: request.createdTaskId!,
        date: '2030-05-09',
        time: '15:30:00',
        durationMinutes: 45,
      })
      expect(moved).toBeTruthy()
      expect(moved!.previous).toEqual({ date: DATE, time: '10:00', durationMinutes: 30 })
      expect(moved!.request.requestedDate).toBe('2030-05-09')
      expect(moved!.request.requestedDurationMinutes).toBe(45)
      // A confirmação era sobre o horário velho.
      expect(moved!.request.requesterConfirmedAt).toBeNull()

      // O link do email anterior morreu; o novo funciona.
      await expect(getRequestByRequesterToken(db, requesterToken!)).rejects.toThrow(/inválido/i)
      const view = await getRequestByRequesterToken(db, moved!.requesterToken)
      expect(view).toMatchObject({ date: '2030-05-09', time: '15:30', durationMinutes: 45 })
    } finally {
      await pool.end()
    }
  })

  it('remarcar para o MESMO horário não emite token nem avisa', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { request } = await aceitar(db, alice)
      const moved = await syncBookingOnTaskReschedule(db, {
        taskId: request.createdTaskId!,
        date: DATE,
        time: '10:00:00',
        durationMinutes: 30,
      })
      expect(moved).toBeNull()
    } finally {
      await pool.end()
    }
  })

  it('tarefa que não veio de agendamento não dispara nada', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const avulsa = await createTask(db, {
        userId: alice,
        input: { title: 'Tarefa normal', scheduledDate: DATE, scheduledTime: '08:00', durationMinutes: 30 },
      })
      const moved = await syncBookingOnTaskReschedule(db, {
        taskId: avulsa.id,
        date: '2030-06-01',
        time: '09:00',
        durationMinutes: 60,
      })
      expect(moved).toBeNull()
    } finally {
      await pool.end()
    }
  })

  it('perder a duração no PATCH mantém a duração combinada', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const { request } = await aceitar(db, alice, { duration: 45 })
      const moved = await syncBookingOnTaskReschedule(db, {
        taskId: request.createdTaskId!,
        date: '2030-05-09',
        time: '15:00',
        durationMinutes: null,
      })
      expect(moved!.request.requestedDurationMinutes).toBe(45)
    } finally {
      await pool.end()
    }
  })
})

import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { bookingLinks, bookingRequests, tasks, users } from '~~/server/db/schema'
import {
  DAY_MINUTES,
  fitsInFreeRange,
  freeRanges,
  timeToMin,
  type Interval,
  type TimeRange,
} from '~~/shared/bookingRanges'
import { addDays } from '~~/shared/rrule'
import { OWNER_TIMEZONE, nowMinutesInOwnerTz, todayInOwnerTz } from './clock'
import { createTask } from './tasksService'
import { auditedUpdate } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type BookingLinkRow = typeof bookingLinks.$inferSelect
export type BookingRequestRow = typeof bookingRequests.$inferSelect
export type BookingRequestStatus = BookingRequestRow['status']

function newToken(): string {
  return randomBytes(24).toString('base64url')
}

// ── Faixas livres ───────────────────────────────────────────────────────────

/** Duração sugerida quando o dono não definiu nenhuma. */
export const SUGGESTED_DURATION_MIN = 30

/** 'HH:MM:SS' do Postgres → minutos. O `time` volta com segundos; corta fora. */
function pgTimeToMin(value: unknown): number {
  return timeToMin(String(value).slice(0, 5))
}

/**
 * Tudo que ocupa a agenda do dono numa data.
 *
 * São duas fontes, e as duas contam:
 *  - **tarefas agendadas** (a agenda real, com a duração da própria tarefa);
 *  - **solicitações `pending` e `accepted`**. Pendente bloquear é deliberado:
 *    antes só a aceita bloqueava, e duas pessoas honestas pediam o mesmo horário
 *    para uma delas levar uma recusa sem entender por quê. O custo é que um
 *    pedido não respondido segura a faixa — contido pelo rate limit de 10/hora
 *    por IP+token na rota que cria a solicitação.
 *
 * As duas consultas varrem **a data e a véspera**. Um compromisso das 23:00 com
 * 3h de duração ocupa até as 02:00 do dia seguinte, e quem só olha a própria
 * data não enxerga isso — a manhã apareceria livre. O deslocamento de -1440
 * rebaseia a véspera no dia consultado; `mergeIntervals` corta o que ficar
 * negativo.
 */
async function busyIntervals(
  db: Db,
  args: { ownerUserId: string; date: string },
): Promise<Interval[]> {
  const out: Interval[] = []
  const prev = addDays(args.date, -1)
  /** Véspera entra rebaseada: 23:00 de ontem é o minuto -60 de hoje. */
  const offsetOf = (date: string) => (date === prev ? -DAY_MINUTES : 0)

  const requested = await db
    .select({
      date: bookingRequests.requestedDate,
      time: bookingRequests.requestedTime,
      dur: bookingRequests.requestedDurationMinutes,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.ownerUserId, args.ownerUserId),
        inArray(bookingRequests.requestedDate, [args.date, prev]),
        inArray(bookingRequests.status, ['pending', 'accepted']),
      ),
    )
  for (const r of requested) {
    const start = pgTimeToMin(r.time) + offsetOf(String(r.date))
    out.push({ start, end: start + r.dur })
  }

  const scheduled = await db
    .select({
      date: tasks.scheduledDate,
      time: tasks.scheduledTime,
      dur: tasks.durationMinutes,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerUserId, args.ownerUserId),
        inArray(tasks.scheduledDate, [args.date, prev]),
        eq(tasks.archived, false),
        isNotNull(tasks.scheduledTime),
      ),
    )
  for (const t of scheduled) {
    const start = pgTimeToMin(t.time) + offsetOf(String(t.date))
    // Tarefa sem duração ainda ocupa espaço; assume a sugestão padrão.
    out.push({ start, end: start + (t.dur ?? SUGGESTED_DURATION_MIN) })
  }

  return out
}

/**
 * As faixas contínuas livres do dia. É o que a página pública exibe — o que não
 * aparece na lista está ocupado.
 *
 * Quando a data é hoje, o passado some: ninguém deve conseguir pedir 08:00 às
 * 15h. Quem sabe que horas são é `clock.ts`; `shared/bookingRanges` só recebe o
 * corte pronto. `now` é injetável para o teste não precisar de fake timer em
 * cima de `Intl.DateTimeFormat`.
 */
export async function computeFreeRanges(
  db: Db,
  args: { ownerUserId: string; date: string; now?: Date },
): Promise<TimeRange[]> {
  const now = args.now ?? new Date()
  const busy = await busyIntervals(db, args)
  const isToday = args.date === todayInOwnerTz(now)
  return freeRanges(busy, { fromMin: isToday ? nowMinutesInOwnerTz(now) : 0 })
}

// ── Links (dono) ──────────────────────────────────────────────────────────

/**
 * O link do dono, criando na primeira vez que alguém pergunta.
 *
 * Todo usuário tem exatamente um, então não faz sentido obrigá-lo a apertar
 * "criar" antes de poder copiar a própria URL — a criação preguiçosa é o que a
 * tela já queria (o `onMounted` antigo abria o painel de criação sozinho quando
 * a lista vinha vazia).
 *
 * A corrida entre duas abas é resolvida pelo índice único `booking_links_owner_idx`:
 * quem perde recebe zero linhas do `onConflictDoNothing` e relê. Estourar erro
 * ali seria errado — o resultado que o chamador quer existe, só foi outro que
 * criou.
 */
export async function getOrCreateBookingLink(
  db: Db,
  ownerUserId: string,
): Promise<BookingLinkRow> {
  const [existing] = await db
    .select()
    .from(bookingLinks)
    .where(eq(bookingLinks.ownerUserId, ownerUserId))
    .limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(bookingLinks)
    .values({ ownerUserId, token: newToken(), name: '' })
    .onConflictDoNothing({ target: bookingLinks.ownerUserId })
    .returning()
  if (created) return created

  const [raced] = await db
    .select()
    .from(bookingLinks)
    .where(eq(bookingLinks.ownerUserId, ownerUserId))
    .limit(1)
  if (!raced) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar link de agendamento.')
  return raced
}

export async function updateBookingLink(
  db: Db,
  args: {
    ownerUserId: string
    patch: {
      name?: string
      description?: string
      defaultDurationMinutes?: number | null
      active?: boolean
    }
  },
): Promise<BookingLinkRow> {
  // Garante que existe antes de tentar atualizar: o dono pode abrir a tela e
  // salvar sem nunca ter passado por um GET.
  await getOrCreateBookingLink(db, args.ownerUserId)

  const set: Record<string, unknown> = { updatedAt: new Date() }
  // `name` vazio é legítimo agora — a página pública cai no nome do dono.
  if (args.patch.name !== undefined) set.name = args.patch.name.trim()
  if (args.patch.description !== undefined) set.description = args.patch.description.trim()
  if (args.patch.defaultDurationMinutes !== undefined) {
    set.defaultDurationMinutes = args.patch.defaultDurationMinutes
  }
  if (args.patch.active !== undefined) set.active = args.patch.active

  const [row] = await db
    .update(bookingLinks)
    .set(set)
    .where(eq(bookingLinks.ownerUserId, args.ownerUserId))
    .returning()
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Link não encontrado.')
  return row
}

/**
 * Troca o token, invalidando a URL que estiver circulando.
 *
 * Tem verbo próprio de propósito. Já foi um booleano `regenerateToken` no corpo
 * do PATCH, e o cliente manda o patch inteiro de volta a cada salvamento — um
 * formulário que ecoasse o próprio estado trocaria o token do usuário por
 * acidente. Ação destrutiva pede chamada explícita.
 */
export async function regenerateBookingToken(
  db: Db,
  ownerUserId: string,
): Promise<BookingLinkRow> {
  await getOrCreateBookingLink(db, ownerUserId)
  const [row] = await db
    .update(bookingLinks)
    .set({ token: newToken(), updatedAt: new Date() })
    .where(eq(bookingLinks.ownerUserId, ownerUserId))
    .returning()
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Link não encontrado.')
  return row
}

// ── Público ───────────────────────────────────────────────────────────────

export type PublicBookingLink = {
  /** `name` do link, ou o nome do dono quando ele não batizou. */
  title: string
  description: string
  /** Pré-preenche o campo "Fim" quando o visitante clica numa faixa livre. */
  suggestedDurationMinutes: number
  /** Rótulo IANA. Não há conversão — é o fuso em que os horários são lidos. */
  timezone: string
  /** Hoje no relógio do DONO. O calendário usa como data mínima. */
  today: string
}

/**
 * Dados mínimos p/ renderizar a página pública. NÃO expõe owner/token.
 *
 * O `today` vem daqui, e não de `new Date()` no navegador, porque quem olha a
 * página pode estar em qualquer fuso — o dia mínimo do calendário é uma
 * pergunta sobre o relógio do dono.
 */
export async function getPublicBookingLink(db: Db, token: string): Promise<PublicBookingLink> {
  const [row] = await db
    .select({
      ownerUserId: bookingLinks.ownerUserId,
      name: bookingLinks.name,
      description: bookingLinks.description,
      defaultDurationMinutes: bookingLinks.defaultDurationMinutes,
      active: bookingLinks.active,
    })
    .from(bookingLinks)
    .where(eq(bookingLinks.token, token))
    .limit(1)
  if (!row || !row.active) throw createApiError(ErrCode.NOT_FOUND, 'Link indisponível.')

  // Consulta separada em vez de join: `booking_links.name` e `users.name` têm o
  // mesmo nome de coluna, e o driver embaralha as duas no mapeamento do
  // resultado. Mesma abordagem de `createBookingRequest`.
  const [owner] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.ownerUserId))
    .limit(1)

  return {
    title: row.name.trim() || `Agendar com ${owner?.name ?? 'a gente'}`,
    description: row.description,
    suggestedDurationMinutes: row.defaultDurationMinutes ?? SUGGESTED_DURATION_MIN,
    timezone: OWNER_TIMEZONE,
    today: todayInOwnerTz(),
  }
}

/** Faixas livres de um dia ('YYYY-MM-DD') para a página pública. */
export async function getFreeRanges(
  db: Db,
  args: { token: string; date: string },
): Promise<{ date: string; ranges: TimeRange[]; suggestedDurationMinutes: number }> {
  const [link] = await db
    .select({
      ownerUserId: bookingLinks.ownerUserId,
      defaultDurationMinutes: bookingLinks.defaultDurationMinutes,
      active: bookingLinks.active,
    })
    .from(bookingLinks)
    .where(eq(bookingLinks.token, args.token))
    .limit(1)
  if (!link || !link.active) throw createApiError(ErrCode.NOT_FOUND, 'Link indisponível.')
  const ranges = await computeFreeRanges(db, {
    ownerUserId: link.ownerUserId,
    date: args.date,
  })
  return {
    date: args.date,
    ranges,
    suggestedDurationMinutes: link.defaultDurationMinutes ?? SUGGESTED_DURATION_MIN,
  }
}

export type BookingRequestInput = {
  reason: string
  description?: string
  name: string
  email: string
  whatsapp: string
  date: string
  /** Início 'HH:MM'. */
  start: string
  /** Fim 'HH:MM', exclusivo. Precisa ser depois do início, no mesmo dia. */
  end: string
}

export type CreatedBookingRequest = {
  requestId: string
  ownerUserId: string
  ownerEmail: string
  ownerName: string
}

export async function createBookingRequest(
  db: Db,
  args: { token: string; input: BookingRequestInput },
): Promise<CreatedBookingRequest> {
  const [link] = await db
    .select({
      id: bookingLinks.id,
      ownerUserId: bookingLinks.ownerUserId,
      active: bookingLinks.active,
    })
    .from(bookingLinks)
    .where(eq(bookingLinks.token, args.token))
    .limit(1)
  if (!link || !link.active) throw createApiError(ErrCode.NOT_FOUND, 'Link indisponível.')

  const [owner] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, link.ownerUserId))
    .limit(1)
  if (!owner) throw createApiError(ErrCode.NOT_FOUND, 'Destinatário não encontrado.')

  const requested: Interval = {
    start: timeToMin(args.input.start),
    end: timeToMin(args.input.end),
  }

  const row = await db.transaction(async (tx) => {
    // Agora que solicitação pendente bloqueia horário, dois envios simultâneos
    // para a mesma faixa passariam os dois: em READ COMMITTED cada transação lê
    // o estado sem enxergar a outra. A trava serializa por dono — é o mesmo
    // espírito do flip atômico de `decideBookingRequest`, e o escopo `xact` a
    // solta sozinha no commit ou no rollback.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`booking:${link.ownerUserId}`}, 0))`,
    )

    // A revalidação vive DENTRO da transação, depois da trava. O GET de faixas
    // é conveniência para a tela; este é o portão. Nada que o cliente manda
    // além de data/início/fim entra no cálculo — em particular, nenhum fuso.
    const free = await computeFreeRanges(tx as unknown as Db, {
      ownerUserId: link.ownerUserId,
      date: args.input.date,
    })
    if (!fitsInFreeRange(requested, free)) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Horário indisponível. Escolha outro.')
    }

    const [inserted] = await tx
      .insert(bookingRequests)
      .values({
        bookingLinkId: link.id,
        ownerUserId: link.ownerUserId,
        title: args.input.reason.trim(),
        description: args.input.description?.trim() ?? '',
        requesterName: args.input.name.trim(),
        requesterEmail: args.input.email.trim().toLowerCase(),
        requesterWhatsapp: args.input.whatsapp.trim(),
        requestedDate: args.input.date,
        requestedTime: args.input.start,
        requestedDurationMinutes: requested.end - requested.start,
      })
      .returning({ id: bookingRequests.id })
    if (!inserted) throw createApiError(ErrCode.INTERNAL, 'Falha ao registrar solicitação.')
    return inserted
  })

  return {
    requestId: row.id,
    ownerUserId: link.ownerUserId,
    ownerEmail: owner.email,
    ownerName: owner.name,
  }
}

// ── Solicitações (dono) ─────────────────────────────────────────────────────

// O join com `booking_links` para trazer o nome do link saiu: com um link só por
// dono, o nome não distingue nada — toda solicitação viria com o mesmo rótulo.
export async function listBookingRequests(
  db: Db,
  args: { ownerUserId: string; status?: BookingRequestStatus },
): Promise<BookingRequestRow[]> {
  const where = args.status
    ? and(eq(bookingRequests.ownerUserId, args.ownerUserId), eq(bookingRequests.status, args.status))
    : eq(bookingRequests.ownerUserId, args.ownerUserId)

  return await db
    .select()
    .from(bookingRequests)
    .where(where)
    .orderBy(desc(bookingRequests.createdAt))
}

export type DecisionResult = {
  request: BookingRequestRow
  requesterEmail: string
  requesterName: string
  /**
   * Token CRU do link de confirmar/recusar, só no aceite. Existe apenas neste
   * retorno — o banco guarda o hash, e nenhuma resposta HTTP o devolve. Quem
   * recebe é o email.
   */
  requesterToken: string | null
}

export async function decideBookingRequest(
  db: Db,
  args: {
    ownerUserId: string
    requestId: string
    decision: 'accepted' | 'rejected'
    message?: string
  },
): Promise<DecisionResult> {
  return await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.id, args.requestId),
          eq(bookingRequests.ownerUserId, args.ownerUserId),
        ),
      )
      .limit(1)
    if (!req) throw createApiError(ErrCode.NOT_FOUND, 'Solicitação não encontrada.')
    if (req.status !== 'pending') {
      throw createApiError(ErrCode.BAD_REQUEST, 'Solicitação já foi decidida.')
    }

    let createdTaskId: string | null = null
    if (args.decision === 'accepted') {
      // A duração vem da PRÓPRIA solicitação, não mais do default do link. O
      // visitante declarou um fim explícito e recebeu confirmação com ele —
      // criar a tarefa com outra duração seria marcar um compromisso diferente
      // do combinado. De quebra some um bug: quando o link de origem já tinha
      // sido apagado (FK SET NULL), a tarefa nascia sem duração e não aparecia
      // na grade da agenda.
      const durationMinutes = req.requestedDurationMinutes
      const contato =
        `\n\n— Solicitado via agendamento —\n` +
        `Nome: ${req.requesterName}\n` +
        `Email: ${req.requesterEmail}\n` +
        `WhatsApp: ${req.requesterWhatsapp}`
      const task = await createTask(tx as unknown as Db, {
        userId: args.ownerUserId,
        input: {
          title: req.title,
          description: (req.description ? req.description : '') + contato,
          scheduledDate: req.requestedDate,
          scheduledTime: req.requestedTime,
          durationMinutes,
        },
      })
      createdTaskId = task.id
    }

    // No aceite nasce o token de ação do solicitante, na MESMA transação que
    // cria a tarefa: se o insert falhar, não fica token válido apontando para
    // um compromisso que não existe.
    const rawToken = args.decision === 'accepted' ? newRequesterToken() : null

    // Flip atômico: o WHERE status='pending' garante uma única decisão mesmo
    // sob corrida (mesma defesa do acceptInvitation).
    const [updated] = await tx
      .update(bookingRequests)
      .set({
        status: args.decision,
        decisionMessage: args.message?.trim() || null,
        decidedAt: new Date(),
        createdTaskId,
        ...(rawToken
          ? {
              requesterTokenHash: sha256Hex(rawToken),
              requesterTokenExpiresAt: requesterTokenExpiry(req.requestedDate),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(bookingRequests.id, req.id), eq(bookingRequests.status, 'pending')),
      )
      .returning()
    if (!updated) throw createApiError(ErrCode.BAD_REQUEST, 'Solicitação já foi decidida.')

    return {
      request: updated,
      requesterEmail: updated.requesterEmail,
      requesterName: updated.requesterName,
      requesterToken: rawToken,
    }
  })
}

// ── Ações do solicitante (link no email) ────────────────────────────────────
//
// Aqui é o único lugar do fluxo que roda SEM sessão: quem clica no link do
// email não tem conta. A autorização é o token, e por isso ele segue o molde do
// `personInvitations` — 32 bytes aleatórios, só o sha256 no banco, prazo, e
// queima no uso (`invitationService.ts`). O `bookingLinks.token` é o caso
// oposto e continua em claro de propósito: aquele é um link de perfil, reusado.

function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function newRequesterToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Validade do token: dois dias depois da meia-noite UTC da data do compromisso.
 *
 * Prazo fixo (7 dias, como o convite) não serve aqui — um agendamento marcado
 * para daqui a dois meses teria o link morto muito antes de acontecer. Prender
 * na data do compromisso resolve, e a folga de dois dias evita matemática de
 * fuso: cobre qualquer offset entre o relógio do dono e o UTC sem precisar
 * reconstruir o horário local.
 */
function requesterTokenExpiry(requestedDate: string): Date {
  return new Date(new Date(`${requestedDate}T00:00:00Z`).getTime() + 2 * 86_400_000)
}

/** O que a página pública do link de ação mostra. Não expõe dono nem token. */
export type RequesterView = {
  title: string
  description: string
  date: string
  /** 'HH:MM' — sem os segundos que o `time` do Postgres devolve. */
  time: string
  durationMinutes: number
  ownerName: string
  status: BookingRequestStatus
  confirmed: boolean
}

async function findByRequesterToken(db: Db, rawToken: string) {
  const [row] = await db
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.requesterTokenHash, sha256Hex(rawToken)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Link inválido ou já usado.')
  if (row.requesterTokenExpiresAt && row.requesterTokenExpiresAt.getTime() < Date.now()) {
    throw createApiError(ErrCode.NOT_FOUND, 'Este link expirou.')
  }
  return row
}

export async function getRequestByRequesterToken(
  db: Db,
  rawToken: string,
): Promise<RequesterView> {
  const row = await findByRequesterToken(db, rawToken)
  const [owner] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.ownerUserId))
    .limit(1)

  return {
    title: row.title,
    description: row.description,
    date: row.requestedDate,
    time: String(row.requestedTime).slice(0, 5),
    durationMinutes: row.requestedDurationMinutes,
    ownerName: owner?.name ?? 'a gente',
    status: row.status,
    confirmed: row.requesterConfirmedAt !== null,
  }
}

/** "Confirmo que vou." Só carimba — não mexe no status nem queima o token. */
export async function requesterConfirm(db: Db, rawToken: string): Promise<RequesterView> {
  const row = await findByRequesterToken(db, rawToken)
  if (row.status !== 'accepted') {
    throw createApiError(ErrCode.BAD_REQUEST, 'Este agendamento não está confirmado pelo dono.')
  }
  // O token sobrevive à confirmação de propósito: quem confirmou hoje pode
  // precisar desmarcar amanhã, e é o mesmo link.
  if (!row.requesterConfirmedAt) {
    await db
      .update(bookingRequests)
      .set({ requesterConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookingRequests.id, row.id))
  }
  return await getRequestByRequesterToken(db, rawToken)
}

export type DeclineResult = {
  request: BookingRequestRow
  ownerEmail: string
  ownerName: string
  /** true quando havia tarefa criada no aceite e ela foi arquivada. */
  taskArchived: boolean
}

/**
 * "Não vou poder." Cancela e arquiva a tarefa criada no aceite.
 *
 * Arquiva em vez de apagar: o histórico fica em `/arquivo` e dá para restaurar
 * se a pessoa voltar atrás. E o horário volta a ficar livre de graça — as duas
 * pontas de `busyIntervals()` já ignoram tarefa arquivada
 * (`eq(tasks.archived, false)`) e solicitação fora de `('pending','accepted')`.
 */
export async function requesterDecline(db: Db, rawToken: string): Promise<DeclineResult> {
  return await db.transaction(async (tx) => {
    const row = await findByRequesterToken(tx as unknown as Db, rawToken)
    if (row.status !== 'pending' && row.status !== 'accepted') {
      throw createApiError(ErrCode.BAD_REQUEST, 'Este agendamento já foi encerrado.')
    }

    // Flip atômico com a guarda LARGA — de propósito diferente da decisão do
    // dono, que exige `status='pending'`. O solicitante pode desistir depois do
    // aceite; é justamente o caso que o pedido descreve.
    const [updated] = await tx
      .update(bookingRequests)
      .set({
        status: 'cancelled',
        // Queima o token: desistir é ação única.
        requesterTokenHash: null,
        requesterTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookingRequests.id, row.id),
          inArray(bookingRequests.status, ['pending', 'accepted']),
        ),
      )
      .returning()
    if (!updated) throw createApiError(ErrCode.BAD_REQUEST, 'Este agendamento já foi encerrado.')

    let taskArchived = false
    if (updated.createdTaskId) {
      const [task] = await tx
        .select({ id: tasks.id, archived: tasks.archived })
        .from(tasks)
        .where(eq(tasks.id, updated.createdTaskId))
        .limit(1)
      if (task && !task.archived) {
        // Passa por `auditedUpdate` como toda mutação de tarefa (regra própria
        // do eslint: `local/no-raw-db-update`), senão o arquivamento não
        // apareceria na aba Histórico da tarefa.
        //
        // `actorUserId` é null de propósito: quem arquivou não tem conta — é o
        // solicitante clicando no link do email. O `context` é o que conta essa
        // história para quem for ler o audit_log depois.
        await auditedUpdate(
          tx,
          tasks,
          task.id,
          null,
          { archived: true, updatedAt: new Date() },
          {
            entity: 'task',
            context: {
              reason: 'booking-declined-by-requester',
              bookingRequestId: updated.id,
              requesterEmail: updated.requesterEmail,
            },
          },
        )
        taskArchived = true
      }
    }

    const [owner] = await tx
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, updated.ownerUserId))
      .limit(1)
    if (!owner) throw createApiError(ErrCode.NOT_FOUND, 'Destinatário não encontrado.')

    return { request: updated, ownerEmail: owner.email, ownerName: owner.name, taskArchived }
  })
}

/**
 * Sincroniza a solicitação quando o DONO remarca a tarefa criada no aceite, e
 * devolve um token novo (o anterior morre junto).
 *
 * Devolve `null` quando a tarefa não veio de um agendamento — que é o caso da
 * esmagadora maioria dos PATCHes de tarefa.
 */
export type RescheduleResult = {
  request: BookingRequestRow
  requesterToken: string
  /** Como estava antes, para o email conseguir dizer "de X para Y". */
  previous: { date: string; time: string; durationMinutes: number }
}

export async function syncBookingOnTaskReschedule(
  db: Db,
  args: {
    taskId: string
    date: string
    /** 'HH:MM' ou 'HH:MM:SS'. */
    time: string
    /** `null` = a tarefa ficou sem duração; mantém a que a solicitação já tinha. */
    durationMinutes: number | null
  },
): Promise<RescheduleResult | null> {
  const [row] = await db
    .select()
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.createdTaskId, args.taskId),
        eq(bookingRequests.status, 'accepted'),
      ),
    )
    .limit(1)
  if (!row) return null

  const previous = {
    date: row.requestedDate,
    time: String(row.requestedTime).slice(0, 5),
    durationMinutes: row.requestedDurationMinutes,
  }
  const time = args.time.slice(0, 5)
  // `requested_duration_minutes` é NOT NULL; a tarefa pode ter perdido a
  // duração no PATCH. Nesse caso o compromisso combinado continua valendo.
  const durationMinutes = args.durationMinutes ?? previous.durationMinutes
  if (
    previous.date === args.date &&
    previous.time === time &&
    previous.durationMinutes === durationMinutes
  ) {
    return null
  }

  const rawToken = newRequesterToken()
  const [updated] = await db
    .update(bookingRequests)
    .set({
      requestedDate: args.date,
      requestedTime: time,
      requestedDurationMinutes: durationMinutes,
      // Remarcou ⇒ a confirmação anterior não vale mais: ela era sobre o
      // horário antigo. Zera para o painel voltar a dizer "aguardando".
      requesterConfirmedAt: null,
      requesterTokenHash: sha256Hex(rawToken),
      requesterTokenExpiresAt: requesterTokenExpiry(args.date),
      updatedAt: new Date(),
    })
    .where(eq(bookingRequests.id, row.id))
    .returning()
  if (!updated) return null

  return { request: updated, requesterToken: rawToken, previous }
}

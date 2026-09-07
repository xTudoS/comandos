import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  integer,
  date,
  time,
} from 'drizzle-orm/pg-core'
import { users } from './auth'
import { tasks } from './tasks'

// Link público de agendamento. **Um por dono** — daí o índice ÚNICO em
// `owner_user_id`. Já foram vários links nomeados, com janelas semanais de
// disponibilidade e slots de 30min; o modelo virou "o dia inteiro está aberto,
// menos o que já está ocupado" e nada disso sobreviveu.
//
// O `token` cru fica na URL pública. Guardamos o token em si, não o hash, ao
// contrário dos convites single-use: este é um link de longa duração que a
// pessoa cola no perfil e reusa.
export const bookingLinks = pgTable(
  'booking_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    /** Título da página pública. Vazio = cai no nome do dono ("Agendar com X"). */
    name: text('name').notNull().default(''),
    description: text('description').notNull().default(''),
    /** Duração sugerida (min): pré-preenche o campo "Fim" quando o visitante
     * clica numa faixa livre, e é o fallback da tarefa criada no aceite. */
    defaultDurationMinutes: integer('default_duration_minutes'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('booking_links_owner_idx').on(t.ownerUserId)],
)

// `cancelled` é a recusa DO SOLICITANTE, e existe separado de `rejected` de
// propósito: `rejected` é o dono dizendo não, `cancelled` é quem pediu desistindo
// (pelo link do email) depois de já ter sido aceito. Colapsar os dois perderia
// justamente a informação que o dono precisa ver no painel.
export const bookingRequestStatus = pgEnum('booking_request_status', [
  'pending',
  'accepted',
  'rejected',
  'cancelled',
])

// Solicitações recebidas via link público. Permanecem mesmo que o link seja
// apagado (FK onDelete:'set null') — `ownerUserId` é desnormalizado pra
// listagem e p/ não perder histórico.
export const bookingRequests = pgTable(
  'booking_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingLinkId: uuid('booking_link_id').references(() => bookingLinks.id, {
      onDelete: 'set null',
    }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** "Motivo" informado pelo solicitante → vira o título da tarefa. */
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    requesterName: text('requester_name').notNull(),
    requesterEmail: text('requester_email').notNull(),
    requesterWhatsapp: text('requester_whatsapp').notNull(),
    requestedDate: date('requested_date').notNull(),
    requestedTime: time('requested_time').notNull(),
    /** Duração pedida (min). A UI coleta início e fim; o servidor deriva daqui a
     * duração da tarefa criada no aceite — mesmo formato de `tasks.duration_minutes`. */
    requestedDurationMinutes: integer('requested_duration_minutes').notNull(),
    status: bookingRequestStatus('status').notNull().default('pending'),
    /**
     * Token de ação do SOLICITANTE — o link de confirmar/recusar que vai no
     * email do aceite e no de remarcação.
     *
     * Guardamos só o sha256, ao contrário do `bookingLinks.token`: aquele é um
     * link longo de perfil, reusado; este autoriza uma ação sobre um
     * compromisso específico. Mesmo molde de `personInvitations.tokenHash`
     * (ver server/utils/invitationService.ts).
     *
     * Remarcar emite um token novo, o que invalida o anterior — quem tiver o
     * email velho não confirma um horário que não existe mais.
     */
    requesterTokenHash: text('requester_token_hash').unique(),
    requesterTokenExpiresAt: timestamp('requester_token_expires_at', { withTimezone: true }),
    /** Carimbo do "Confirmar". Não muda o status — só registra que a pessoa viu e topou. */
    requesterConfirmedAt: timestamp('requester_confirmed_at', { withTimezone: true }),
    /** Mensagem opcional que o dono escreve no aceite/recusa (vai no email). */
    decisionMessage: text('decision_message'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdTaskId: uuid('created_task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('booking_requests_owner_status_idx').on(t.ownerUserId, t.status),
    index('booking_requests_link_idx').on(t.bookingLinkId),
    // O cálculo de faixas livres filtra por (dono, data) a cada troca de dia no
    // calendário público. O índice por status não cobre esse recorte.
    index('booking_requests_owner_date_idx').on(t.ownerUserId, t.requestedDate),
  ],
)

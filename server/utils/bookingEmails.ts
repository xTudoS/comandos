/**
 * Textos dos emails de agendamento, num lugar só.
 *
 * Antes cada handler montava a sua template string inline. Com o ciclo fechado
 * (aceite → confirma/recusa pelo link → remarcação → aviso ao dono) passaram a
 * ser cinco mensagens que precisam falar a mesma língua e formatar data do
 * mesmo jeito; espalhadas, divergem na primeira edição.
 *
 * São builders puros — devolvem `{subject, text}` e não tocam em rede. Quem
 * envia é `sendBestEffort` abaixo.
 */
import { formatDuration, minToTime, timeToMin } from '~~/shared/bookingRanges'

export type MailerLike = {
  send(args: { to: string; subject: string; text: string; html?: string }): Promise<unknown>
}

export type BookingMessage = { subject: string; text: string }

/**
 * Envia sem deixar o erro derrubar a request.
 *
 * Existe por causa de um bug real: em `booking/[token]/request.post.ts` a
 * solicitação já estava COMMITADA quando o `send()` rodava, então uma falha da
 * Resend virava 500 para o visitante — que via "erro" e reenviava um pedido que
 * na verdade tinha sido gravado. Email é efeito colateral pós-commit; quando
 * falha, o certo é registrar e seguir.
 */
export async function sendBestEffort(
  mailer: MailerLike,
  args: { to: string; subject: string; text: string },
): Promise<boolean> {
  try {
    await mailer.send(args)
    return true
  } catch (err) {
    console.error('[bookingEmails] falha ao enviar', args.subject, err)
    return false
  }
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. Mesmo formato do painel `/agendamentos`. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** "09:00 – 09:30 (30 min)". Aceita 'HH:MM' ou o 'HH:MM:SS' do Postgres. */
export function fmtRange(time: string, durationMinutes: number): string {
  const start = time.slice(0, 5)
  const end = minToTime(timeToMin(start) + durationMinutes)
  return `${start} – ${end} (${formatDuration(durationMinutes)})`
}

export type Appointment = {
  title: string
  date: string
  time: string
  durationMinutes: number
}

function when(a: Appointment): string {
  return `${fmtDate(a.date)}, ${fmtRange(a.time, a.durationMinutes)}`
}

/**
 * O bloco de ação. É o que transforma o email de aviso em decisão — antes o
 * solicitante recebia a confirmação e não tinha o que fazer com ela.
 */
function actionBlock(actionUrl: string): string {
  return (
    `\nPode confirmar ou desmarcar por aqui:\n${actionUrl}\n` +
    `\nSe não puder mais, use o mesmo link para desmarcar — o horário volta a ficar livre.\n`
  )
}

const SIGN = `\n— Comando`

/** Ao solicitante: o dono aceitou. Leva o link de confirmar/desmarcar. */
export function acceptedEmail(args: {
  requesterName: string
  ownerName: string
  appointment: Appointment
  message?: string | null
  actionUrl: string
}): BookingMessage {
  return {
    subject: `Agendamento confirmado: ${args.appointment.title}`,
    text:
      `Olá, ${args.requesterName}.\n\n` +
      `Sua solicitação "${args.appointment.title}" foi ACEITA por ${args.ownerName}.\n` +
      `Quando: ${when(args.appointment)}\n` +
      (args.message ? `\nMensagem de ${args.ownerName}:\n${args.message}\n` : '') +
      actionBlock(args.actionUrl) +
      SIGN,
  }
}

/** Ao solicitante: o dono recusou. Sem link — não há o que decidir. */
export function rejectedEmail(args: {
  requesterName: string
  ownerName: string
  appointment: Appointment
  message?: string | null
}): BookingMessage {
  return {
    subject: `Agendamento não confirmado: ${args.appointment.title}`,
    text:
      `Olá, ${args.requesterName}.\n\n` +
      `Sua solicitação "${args.appointment.title}" para ${when(args.appointment)} ` +
      `não pôde ser confirmada.\n` +
      (args.message ? `\nMensagem de ${args.ownerName}:\n${args.message}\n` : '') +
      SIGN,
  }
}

/** Ao solicitante: o dono remarcou. Link novo — o anterior já não vale. */
export function rescheduledEmail(args: {
  requesterName: string
  ownerName: string
  appointment: Appointment
  previous: { date: string; time: string; durationMinutes: number }
  actionUrl: string
}): BookingMessage {
  const before = `${fmtDate(args.previous.date)}, ${fmtRange(args.previous.time, args.previous.durationMinutes)}`
  return {
    subject: `Agendamento remarcado: ${args.appointment.title}`,
    text:
      `Olá, ${args.requesterName}.\n\n` +
      `${args.ownerName} remarcou "${args.appointment.title}".\n\n` +
      `Antes: ${before}\n` +
      `Agora: ${when(args.appointment)}\n` +
      actionBlock(args.actionUrl) +
      `\nO link anterior deixou de valer.\n` +
      SIGN,
  }
}

/** Ao DONO: o solicitante desmarcou pelo link do email. */
export function declinedByRequesterEmail(args: {
  ownerName: string
  requesterName: string
  requesterEmail: string
  appointment: Appointment
  taskArchived: boolean
}): BookingMessage {
  return {
    subject: `Agendamento desmarcado: ${args.appointment.title}`,
    text:
      `Olá, ${args.ownerName}.\n\n` +
      `${args.requesterName} (${args.requesterEmail}) desmarcou "${args.appointment.title}".\n` +
      `Era: ${when(args.appointment)}\n\n` +
      (args.taskArchived
        ? `A tarefa correspondente foi arquivada e o horário voltou a ficar livre.\n` +
          `Se precisar dela de volta, está em /arquivo.\n`
        : `Não havia tarefa criada para este agendamento.\n`) +
      SIGN,
  }
}

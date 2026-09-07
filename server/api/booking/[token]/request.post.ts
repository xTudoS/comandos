import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import { createBookingRequest } from '~~/server/utils/bookingService'
import { sendBestEffort } from '~~/server/utils/bookingEmails'
import { MIN_RANGE_MIN, timeToMin } from '~~/shared/bookingRanges'
import { isValidPhone } from '~~/shared/phone'
import { checkRateLimit } from '~~/server/utils/rateLimit'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import { resolveSiteOrigin } from '~~/server/utils/siteOrigin'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Toda regra carrega mensagem em pt-BR dizendo QUAL campo e O QUE fazer. O
// texto padrão do Zod ("Too small: expected string to have >=5 characters")
// chegava cru na tela do visitante, que não tem como saber que aquilo era o
// WhatsApp. A mesma regra roda no cliente, para o erro aparecer no campo antes
// de a pessoa chegar na revisão — aqui é o portão, não a interface.
const bodySchema = z
  .object({
    reason: z.string().min(1, 'Informe o motivo do agendamento.').max(500, 'Motivo muito longo.'),
    description: z.string().max(10_000, 'Descrição muito longa.').optional(),
    name: z.string().min(1, 'Informe seu nome.').max(200, 'Nome muito longo.'),
    email: z.email('Email inválido. Confira se não falta algo.').max(320, 'Email muito longo.'),
    // Chega em E.164 (`+5511988887777`) e é validado com as regras reais do
    // país — a MESMA função que a página usa. O visitante pode ser de qualquer
    // lugar, então nada de contar dígitos como se todo mundo fosse do Brasil.
    whatsapp: z
      .string()
      .max(40, 'WhatsApp muito longo.')
      .refine(isValidPhone, { message: 'Número de telefone inválido para o país escolhido.' }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
    start: z.string().regex(HHMM, 'Horário de início inválido.'),
    end: z.string().regex(HHMM, 'Horário de fim inválido.'),
  })
  // Não atravessa a meia-noite: o fim é sempre depois do início, no mesmo dia.
  // O mínimo espelha `MIN_RANGE_MIN` de propósito — nunca aceitar uma reserva
  // menor que a menor faixa que a página chega a ofertar.
  .refine((b) => timeToMin(b.end) - timeToMin(b.start) >= MIN_RANGE_MIN, {
    message: 'O fim precisa ser depois do início.',
    path: ['end'],
  })

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createApiError(ErrCode.BAD_REQUEST, 'Token ausente.')

  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) {
    const first = body.error.issues[0]?.message
    throw createApiError(ErrCode.BAD_REQUEST, first ?? 'Dados inválidos.')
  }

  await checkRateLimit(event, {
    key: `booking:req:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}:${token}`,
    limit: 10,
    windowSec: 3600,
  })

  const db = useDb(event)
  const created = await createBookingRequest(db, { token, input: body.data })

  const siteUrl = resolveSiteOrigin(event)

  // Best-effort: a solicitação já está commitada neste ponto. Antes uma falha
  // da Resend virava 500 para o visitante, que reenviava um pedido já gravado.
  await sendBestEffort(useMailer(event), {
    to: created.ownerEmail,
    subject: `Nova solicitação de agendamento: ${body.data.reason}`,
    text:
      `${body.data.name} solicitou um agendamento com você.\n\n` +
      `Motivo: ${body.data.reason}\n` +
      `Data desejada: ${body.data.date}, das ${body.data.start} às ${body.data.end}\n` +
      (body.data.description ? `Descrição: ${body.data.description}\n` : '') +
      `WhatsApp: ${body.data.whatsapp}\n` +
      `Email: ${body.data.email}\n\n` +
      `Aceite ou recuse em: ${siteUrl}/agendamentos`,
  })

  return { ok: true as const }
})

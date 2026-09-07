import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { useMailer } from '~~/server/utils/mailer'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { updateTask, type ParticipantInvite } from '~~/server/utils/tasksService'
import { sendParticipantInvites } from '~~/server/utils/invitationService'
import { syncBookingOnTaskReschedule } from '~~/server/utils/bookingService'
import { rescheduledEmail, sendBestEffort } from '~~/server/utils/bookingEmails'
import { createApiError, ErrCode } from '~~/server/utils/errors'
import { resolveSiteOrigin } from '~~/server/utils/siteOrigin'

const idSchema = z.string().uuid()
const bodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10_000).optional(),
  horizon: z
    .enum(['core7', 'core30', 'core60', 'core90', 'hibernating'])
    .optional(),
  isMicro: z.boolean().optional(),
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
  scheduledTime: z.string().nullable().optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
  followupActive: z.boolean().optional(),
  followupDate: z.string().nullable().optional(),
  followupHolderPersonId: z.string().uuid().nullable().optional(),
  followupDescription: z.string().max(2000).nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  lifeArea: z
    .enum(['corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias'])
    .nullable()
    .optional(),
  lifeItemId: z.string().uuid().nullable().optional(),
  participants: z
    .array(
      z.object({
        personId: z.string().uuid().nullable().optional(),
        name: z.string().max(200).nullable().optional(),
        email: z.string().max(320).nullable().optional(),
      }),
    )
    .max(50)
    .optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Tarefa não encontrada.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const invites: ParticipantInvite[] = []
  const row = await updateTask(db, {
    userId: user.id,
    taskId: id.data,
    patch: body.data,
    collectInvites: invites,
  })
  // Convite automático para convidados novos com email — best-effort, pós-commit.
  if (invites.length) {
    const siteUrl = resolveSiteOrigin(event)
    await sendParticipantInvites(db, useMailer(event), {
      inviterName: user.name,
      siteUrl,
      invites,
    })
  }

  // "Se eu editar" — remarcar uma tarefa que nasceu de um agendamento avisa
  // quem pediu, com link novo para reconfirmar ou desmarcar.
  //
  // A guarda barata vem primeiro de propósito: só quando o PATCH mexeu em
  // data/hora/duração é que vale consultar `booking_requests`. Sem isso todo
  // PATCH de tarefa (arrastar no board, marcar micro, trocar título) pagaria
  // uma query a mais, e agendamento é a minoria das tarefas.
  const mexeuNoHorario =
    body.data.scheduledDate !== undefined ||
    body.data.scheduledTime !== undefined ||
    body.data.durationMinutes !== undefined
  if (mexeuNoHorario && row.scheduledDate && row.scheduledTime) {
    try {
      const moved = await syncBookingOnTaskReschedule(db, {
        taskId: row.id,
        date: String(row.scheduledDate),
        time: String(row.scheduledTime),
        durationMinutes: row.durationMinutes ?? null,
      })
      if (moved) {
        const message = rescheduledEmail({
          requesterName: moved.request.requesterName,
          ownerName: user.name,
          appointment: {
            title: moved.request.title,
            date: moved.request.requestedDate,
            time: String(moved.request.requestedTime),
            durationMinutes: moved.request.requestedDurationMinutes,
          },
          previous: moved.previous,
          actionUrl: `${resolveSiteOrigin(event)}/agendamento/${moved.requesterToken}`,
        })
        await sendBestEffort(useMailer(event), {
          to: moved.request.requesterEmail,
          ...message,
        })
      }
    } catch (err) {
      // Pós-commit e acessório: a tarefa JÁ foi remarcada. Derrubar o PATCH
      // aqui faria o cliente achar que a edição falhou e tentar de novo.
      console.error('[tasks.patch] falha ao sincronizar agendamento', err)
    }
  }

  return row
})

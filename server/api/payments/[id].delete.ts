import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { deletePayment } from '~~/server/utils/paymentsService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Pagamento não encontrado.')
  const db = useDb(event)
  await deletePayment(db, { userId: user.id, paymentId: id.data })
  return { ok: true as const }
})

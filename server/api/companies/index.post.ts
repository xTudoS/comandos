import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { createCompany } from '~~/server/utils/companiesService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  const row = await createCompany(db, {
    ownerUserId: user.id,
    name: body.data.name,
    id: body.data.id,
  })
  setResponseStatus(event, 201)
  return row
})

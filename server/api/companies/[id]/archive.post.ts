import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { archiveCompany } from '~~/server/utils/companiesService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()
const bodySchema = z.object({ archived: z.boolean() })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.NOT_FOUND, 'Empresa não encontrada.')
  const body = bodySchema.safeParse(await readBody(event))
  if (!body.success) throw createApiError(ErrCode.BAD_REQUEST, 'Payload inválido.')
  const db = useDb(event)
  return await archiveCompany(db, {
    ownerUserId: user.id,
    companyId: id.data,
    archived: body.data.archived,
  })
})

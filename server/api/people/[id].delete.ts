import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { archivePerson } from '~~/server/utils/peopleService'
import { createApiError, ErrCode } from '~~/server/utils/errors'

const idSchema = z.string().uuid()

// Soft-delete: flips `archived` to true so downstream task references remain
// intact. Hard-delete is intentionally not exposed — removing a person with
// tasks attached would orphan audit history.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const id = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createApiError(ErrCode.BAD_REQUEST, 'Id inválido.')
  const db = useDb(event)
  return await archivePerson(db, { ownerUserId: user.id, personId: id.data })
})

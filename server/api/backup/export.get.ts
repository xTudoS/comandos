import { useDb } from '~~/server/utils/db'
import { requireAuthedUser } from '~~/server/utils/sessionGuard'
import { exportBackup } from '~~/server/utils/backupService'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthedUser(event)
  const db = useDb(event)
  const payload = await exportBackup(db, { userId: user.id })
  const filename = `comando-backup-${new Date().toISOString().slice(0, 10)}.json`
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  return payload
})

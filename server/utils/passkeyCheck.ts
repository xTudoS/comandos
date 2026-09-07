import { eq } from 'drizzle-orm'
import { passkeys } from '~~/server/db/schema'
import type { Db } from './db'

export async function userHasPasskey(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .limit(1)
  return rows.length > 0
}

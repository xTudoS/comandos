import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '~~/server/db/schema'

type CloudflareEnv = {
  HYPERDRIVE?: { connectionString: string }
  AUTH_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  ADMIN_BOOTSTRAP_EMAIL?: string
  SITE_URL?: string
}

/**
 * Conexão OU transação. Os serviços recebem `tx` dentro de `db.transaction()`
 * e chamam uns aos outros com ele — o que só tipa se `Db` não exigir `$client`,
 * que a transação não tem (e que ninguém usa neste projeto).
 */
export type Db = Omit<ReturnType<typeof drizzle<typeof schema>>, '$client'>

// Cada chamada abre seu próprio pool (isolamento idêntico ao original — sem risco
// de deadlock por compartilhar um pool max:1 entre transação e query). TODO pool
// criado na request é registrado em `event.context.__dbPools` para ser fechado no
// afterResponse — ver server/plugins/realtimeBroadcast.ts. Sem o `pool.end()`, o
// socket pg fica aberto e o runtime da Cloudflare cancela a request com
// "Worker hung and would never generate a response".
export function useDb(event: any): Db {
  const override = (event.context as { _db?: Db })._db
  if (override) return override
  const cfEnv = (event.context as { cloudflare?: { env?: CloudflareEnv } }).cloudflare?.env
  const hd = cfEnv?.HYPERDRIVE
  if (!hd?.connectionString) {
    throw new Error('HYPERDRIVE binding missing from event.context.cloudflare.env')
  }
  const pool = new Pool({ connectionString: hd.connectionString, max: 1 })
  const ctx = event.context as { __dbPools?: Pool[] }
  ;(ctx.__dbPools ??= []).push(pool)
  return drizzle(pool, { schema })
}

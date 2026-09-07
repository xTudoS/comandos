import { sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb } from './db'
import { createApiError, ErrCode } from './errors'

export async function checkRateLimit(
  event: H3Event,
  args: { key: string; limit: number; windowSec: number },
) {
  // const db = useDb(event)
  // const now = new Date()
  // const cutoff = new Date(now.getTime() - args.windowSec * 1000)

  // const result = await db.execute(sql`
  //   INSERT INTO rate_limit_counters (key, count, window_start)
  //   VALUES (${args.key}, 1, ${now})
  //   ON CONFLICT (key) DO UPDATE SET
  //     count = CASE
  //       WHEN rate_limit_counters.window_start < ${cutoff} THEN 1
  //       ELSE rate_limit_counters.count + 1
  //     END,
  //     window_start = CASE
  //       WHEN rate_limit_counters.window_start < ${cutoff} THEN ${now}
  //       ELSE rate_limit_counters.window_start
  //     END
  //   RETURNING count
  // `)

  // const rows = (result as unknown as { rows: Array<{ count: string | number }> }).rows
  // const count = Number(rows[0]?.count ?? 0)
  // if (count > args.limit && false) {
  //   throw createApiError(ErrCode.RATE_LIMITED, 'Muitas tentativas. Tente mais tarde.')
  // }
}

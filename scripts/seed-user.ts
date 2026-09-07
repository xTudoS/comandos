import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as schema from '../server/db/schema'

const [, , emailArg, nameArg, roleArg] = process.argv
const email = emailArg ?? process.env.SEED_EMAIL
const name = nameArg ?? process.env.SEED_NAME
const role = (roleArg ?? process.env.SEED_ROLE ?? 'delegate') as 'owner' | 'delegate'

if (!email || !name) {
  console.error('Usage: tsx scripts/seed-user.ts <email> <name> [owner|delegate]')
  process.exit(1)
}
if (role !== 'owner' && role !== 'delegate') {
  console.error(`Invalid role: ${role}. Must be 'owner' or 'delegate'.`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })

const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
if (existing.length > 0) {
  console.log(`User already exists: ${email} (id=${existing[0].id})`)
} else {
  const [created] = await db
    .insert(schema.users)
    .values({ email, name, role, emailVerified: true })
    .returning()
  console.log(`Created user: ${created.email} (id=${created.id}, role=${created.role})`)
}

await pool.end()

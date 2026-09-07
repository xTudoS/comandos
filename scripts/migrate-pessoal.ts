import { db } from '../server/utils/db-local'
import { goals, companies } from '../server/db/schema'
import { eq, ilike } from 'drizzle-orm'

async function migrate() {
  console.log('Migrating Pessoal goals...')
  const pessoalCompanies = await db.select().from(companies).where(ilike(companies.name, 'Pessoal'))
  
  if (pessoalCompanies.length === 0) {
    console.log('No Pessoal company found.')
    return
  }

  const companyIds = pessoalCompanies.map(c => c.id)
  console.log(`Found ${companyIds.length} Pessoal companies. Updating goals...`)

  for (const cid of companyIds) {
    const result = await db.update(goals)
      .set({ category: 'personal', companyId: null })
      .where(eq(goals.companyId, cid))
    console.log(`Updated goals for company ${cid}`)
  }

  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(console.error)

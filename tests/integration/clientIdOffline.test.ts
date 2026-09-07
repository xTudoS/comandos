import { describe, it, expect } from 'vitest'
import { createPerson, updatePerson } from '~~/server/utils/peopleService'
import { useTestDb, seedUser } from './helpers'

// Regressão do bug offline-first (sistêmico): o id gerado no cliente deve ser
// honrado pelo servidor no CREATE, para não haver id "stale" (PATCH 404) nem
// duplicata após o sync, incluindo o reenvio idempotente da fila (POST repetido
// com o mesmo id). Exercitado via `people` (o padrão é idêntico em todas as
// entidades: tasks/notes/projects/payments/companies/goals/life).
describe('createPerson — id vindo do cliente (offline-first)', () => {
  it('honra o id fornecido no create', async () => {
    const { db, pool } = await useTestDb()
    try {
      const user = await seedUser(db, { email: 'a@example.com' })
      const id = crypto.randomUUID()
      const row = await createPerson(db, { id, ownerUserId: user, name: 'Offline' })
      expect(row.id).toBe(id)
    } finally {
      await pool.end()
    }
  })

  it('é idempotente: reenviar o create com o mesmo id devolve a linha existente, sem duplicar', async () => {
    const { db, pool } = await useTestDb()
    try {
      const user = await seedUser(db, { email: 'a@example.com' })
      const id = crypto.randomUUID()
      const first = await createPerson(db, { id, ownerUserId: user, name: 'Offline' })
      const second = await createPerson(db, { id, ownerUserId: user, name: 'Offline' })
      expect(second.id).toBe(id)
      expect(second.id).toBe(first.id)
      const all = await db.query.people.findMany({ where: (p, { eq }) => eq(p.id, id) })
      expect(all).toHaveLength(1) // sem duplicata
    } finally {
      await pool.end()
    }
  })

  it('PATCH no id do cliente funciona (não dá 404) após o create', async () => {
    const { db, pool } = await useTestDb()
    try {
      const user = await seedUser(db, { email: 'a@example.com' })
      const id = crypto.randomUUID()
      await createPerson(db, { id, ownerUserId: user, name: 'Offline' })
      const patched = await updatePerson(db, {
        ownerUserId: user,
        personId: id,
        patch: { name: 'Renomeado' },
      })
      expect(patched.id).toBe(id)
      expect(patched.name).toBe('Renomeado')
    } finally {
      await pool.end()
    }
  })
})

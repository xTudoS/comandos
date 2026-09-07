import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { people, auditLog } from '~~/server/db/schema'
import {
  listPeople,
  createPerson,
  updatePerson,
  archivePerson,
  setAssistant,
} from '~~/server/utils/peopleService'
import { useTestDb, seedUser } from './helpers'

async function seedPerson(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: {
    ownerUserId: string
    name: string
    linkedUserId?: string | null
    isAssistant?: boolean
    archived?: boolean
  },
) {
  const [row] = await db
    .insert(people)
    .values({
      ownerUserId: args.ownerUserId,
      name: args.name,
      linkedUserId: args.linkedUserId ?? null,
      isAssistant: args.isAssistant ?? false,
      archived: args.archived ?? false,
    })
    .returning()
  return row!
}

describe('peopleService', () => {
  describe('listPeople', () => {
    it('returns only the authed user\'s unarchived people, sorted by name', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        await seedPerson(db, { ownerUserId: alice, name: 'Zelda' })
        await seedPerson(db, { ownerUserId: alice, name: 'Ana' })
        await seedPerson(db, { ownerUserId: alice, name: 'Arquivada', archived: true })
        await seedPerson(db, { ownerUserId: bob, name: 'Beatriz' })

        const rows = await listPeople(db, { ownerUserId: alice })
        expect(rows.map((r) => r.name)).toEqual(['Ana', 'Zelda'])
      } finally {
        await pool.end()
      }
    })

    it('includes archived rows when includeArchived=true', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        await seedPerson(db, { ownerUserId: alice, name: 'Active' })
        await seedPerson(db, { ownerUserId: alice, name: 'Arquivada', archived: true })

        const rows = await listPeople(db, { ownerUserId: alice, includeArchived: true })
        expect(rows).toHaveLength(2)
      } finally {
        await pool.end()
      }
    })
  })

  describe('createPerson', () => {
    it('trims whitespace on create', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const row = await createPerson(db, { ownerUserId: alice, name: '  Maria  ' })
        expect(row.name).toBe('Maria')
      } finally {
        await pool.end()
      }
    })

    it('rejects a whitespace-only name with 400', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        await expect(
          createPerson(db, { ownerUserId: alice, name: '   ' }),
        ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      } finally {
        await pool.end()
      }
    })

    it('creates a person owned by the caller and writes a create audit row', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const row = await createPerson(db, { ownerUserId: alice, name: 'Maria' })

        expect(row.name).toBe('Maria')
        expect(row.ownerUserId).toBe(alice)
        expect(row.isAssistant).toBe(false)
        expect(row.archived).toBe(false)

        const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, row.id))
        expect(audit!.entityType).toBe('person')
        expect(audit!.action).toBe('create')
        expect(audit!.actorUserId).toBe(alice)
      } finally {
        await pool.end()
      }
    })
  })

  describe('updatePerson', () => {
    it('updates the name and writes an update audit row with the diff', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const created = await createPerson(db, { ownerUserId: alice, name: 'Old Name' })
        await db.delete(auditLog) // reset to isolate this assertion

        const updated = await updatePerson(db, {
          ownerUserId: alice,
          personId: created.id,
          patch: { name: 'New Name' },
        })
        expect(updated.name).toBe('New Name')

        const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id))
        expect(audit!.action).toBe('update')
        const changes = audit!.changes as Record<string, { from: unknown; to: unknown }>
        expect(changes.name).toEqual({ from: 'Old Name', to: 'New Name' })
      } finally {
        await pool.end()
      }
    })

    it('trims whitespace on update', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        const updated = await updatePerson(db, {
          ownerUserId: alice,
          personId: p.id,
          patch: { name: '  Maria Silva  ' },
        })
        expect(updated.name).toBe('Maria Silva')
      } finally {
        await pool.end()
      }
    })

    it('rejects a whitespace-only name', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await expect(
          updatePerson(db, { ownerUserId: alice, personId: p.id, patch: { name: '   ' } }),
        ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      } finally {
        await pool.end()
      }
    })

    it('no-op patch returns the row unchanged without touching the DB', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await db.delete(auditLog)
        const updated = await updatePerson(db, {
          ownerUserId: alice,
          personId: p.id,
          patch: {},
        })
        expect(updated.id).toBe(p.id)
        expect(updated.name).toBe('Maria')
        const audits = await db.select().from(auditLog)
        expect(audits).toHaveLength(0)
      } finally {
        await pool.end()
      }
    })

    it('rejects updates on someone else\'s person with 404 (no enumeration)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })

        await expect(
          updatePerson(db, { ownerUserId: bob, personId: p.id, patch: { name: 'Hacker' } }),
        ).rejects.toMatchObject({
          statusCode: 404,
          data: { error: { code: 'ERR_NOT_FOUND' } },
        })
      } finally {
        await pool.end()
      }
    })
  })

  describe('archivePerson', () => {
    it('soft-deletes by flipping archived=true and writes the audit', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })

        const result = await archivePerson(db, { ownerUserId: alice, personId: p.id })
        expect(result.archived).toBe(true)

        const [row] = await db.select().from(people).where(eq(people.id, p.id))
        expect(row!.archived).toBe(true)

        const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, p.id))
        const archiveAudit = audits.find(
          (a) => (a.changes as Record<string, unknown>).archived !== undefined,
        )
        expect(archiveAudit!.action).toBe('archive')
      } finally {
        await pool.end()
      }
    })
  })

  describe('setAssistant', () => {
    it('rejects promotion when the person has no linked user account', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await expect(
          setAssistant(db, { ownerUserId: alice, personId: p.id }),
        ).rejects.toMatchObject({
          statusCode: 400,
          data: { error: { code: 'ERR_BAD_REQUEST' } },
        })
      } finally {
        await pool.end()
      }
    })

    it('rejects promotion when the person is archived', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const linked = await seedUser(db, { email: 'linked@example.com' })
        const p = await seedPerson(db, {
          ownerUserId: alice,
          name: 'Maria',
          linkedUserId: linked,
          archived: true,
        })
        await expect(
          setAssistant(db, { ownerUserId: alice, personId: p.id }),
        ).rejects.toMatchObject({
          statusCode: 400,
          data: { error: { code: 'ERR_BAD_REQUEST' } },
        })
      } finally {
        await pool.end()
      }
    })

    it('promotes a person; subsequent call is a no-op', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const linked = await seedUser(db, { email: 'maria@example.com' })
        const p = await seedPerson(db, { ownerUserId: alice, name: 'Maria', linkedUserId: linked })

        const first = await setAssistant(db, { ownerUserId: alice, personId: p.id })
        expect(first.isAssistant).toBe(true)

        await db.delete(auditLog)
        const second = await setAssistant(db, { ownerUserId: alice, personId: p.id })
        expect(second.isAssistant).toBe(true)
        const audits = await db.select().from(auditLog)
        expect(audits).toHaveLength(0) // no-op should NOT write audit
      } finally {
        await pool.end()
      }
    })

    it('swapping assistants demotes the previous one and enforces single-assistant invariant', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const u1 = await seedUser(db, { email: 'u1@example.com' })
        const u2 = await seedUser(db, { email: 'u2@example.com' })
        const a = await seedPerson(db, { ownerUserId: alice, name: 'A', linkedUserId: u1 })
        const b = await seedPerson(db, { ownerUserId: alice, name: 'B', linkedUserId: u2 })

        await setAssistant(db, { ownerUserId: alice, personId: a.id })
        await setAssistant(db, { ownerUserId: alice, personId: b.id })

        const rows = await db
          .select()
          .from(people)
          .where(eq(people.ownerUserId, alice))
        const assistants = rows.filter((r) => r.isAssistant)
        expect(assistants).toHaveLength(1)
        expect(assistants[0]!.id).toBe(b.id)

        // Audit trail covers both the demotion of A and promotion of B.
        const audits = await db.select().from(auditLog)
        const demoteA = audits.find(
          (x) =>
            x.entityId === a.id &&
            (x.changes as Record<string, { from: unknown; to: unknown }>).isAssistant?.to === false,
        )
        const promoteB = audits.find(
          (x) =>
            x.entityId === b.id &&
            (x.changes as Record<string, { from: unknown; to: unknown }>).isAssistant?.to === true,
        )
        expect(demoteA).toBeDefined()
        expect(promoteB).toBeDefined()
      } finally {
        await pool.end()
      }
    })

    it('schema-level partial unique index rejects two concurrent raw assistants per owner', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const u1 = await seedUser(db, { email: 'u1@example.com' })
        const u2 = await seedUser(db, { email: 'u2@example.com' })
        await seedPerson(db, {
          ownerUserId: alice,
          name: 'A',
          linkedUserId: u1,
          isAssistant: true,
        })
        await expect(
          seedPerson(db, {
            ownerUserId: alice,
            name: 'B',
            linkedUserId: u2,
            isAssistant: true,
          }),
        ).rejects.toMatchObject({ cause: { code: '23505' } })
      } finally {
        await pool.end()
      }
    })
  })
})

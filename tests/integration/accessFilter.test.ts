import { describe, it, expect } from 'vitest'
import { tasks, taskParticipants, people } from '~~/server/db/schema'
import { taskFilter, canAccessTask } from '~~/server/utils/accessFilter'
import { useTestDb, seedUser } from './helpers'

async function seedTask(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: { ownerUserId: string; createdByUserId?: string; title?: string; delegatePersonId?: string | null },
) {
  const [row] = await db
    .insert(tasks)
    .values({
      ownerUserId: args.ownerUserId,
      createdByUserId: args.createdByUserId ?? args.ownerUserId,
      title: args.title ?? 'T',
      delegatePersonId: args.delegatePersonId ?? null,
    })
    .returning()
  return row!.id
}

async function seedPerson(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: { ownerUserId: string; name: string; linkedUserId?: string | null; archived?: boolean },
) {
  const [row] = await db
    .insert(people)
    .values({
      ownerUserId: args.ownerUserId,
      name: args.name,
      linkedUserId: args.linkedUserId ?? null,
      archived: args.archived ?? false,
    })
    .returning()
  return row!.id
}

async function addParticipant(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: { taskId: string; personId: string },
) {
  await db.insert(taskParticipants).values({ taskId: args.taskId, personId: args.personId })
}

describe('taskFilter + canAccessTask', () => {
  it('includes tasks owned by the user', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const taskId = await seedTask(db, { ownerUserId: alice })

      const visible = await db.select({ id: tasks.id }).from(tasks).where(taskFilter(alice)!)
      expect(visible.map((r) => r.id)).toEqual([taskId])
      expect(await canAccessTask(db, alice, taskId)).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('excludes tasks owned by another user when no delegation is in play', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const taskId = await seedTask(db, { ownerUserId: alice })

      const visibleToBob = await db.select({ id: tasks.id }).from(tasks).where(taskFilter(bob)!)
      expect(visibleToBob).toEqual([])
      expect(await canAccessTask(db, bob, taskId)).toBe(false)
    } finally {
      await pool.end()
    }
  })

  it('includes tasks delegated to a person whose account is linked to the viewer', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const personId = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: maria,
      })
      const taskId = await seedTask(db, { ownerUserId: alice, delegatePersonId: personId })

      const visibleToMaria = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(taskFilter(maria)!)
      expect(visibleToMaria.map((r) => r.id)).toEqual([taskId])
      expect(await canAccessTask(db, maria, taskId)).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('excludes tasks delegated to a person whose account is NOT linked (invite pending)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const other = await seedUser(db, { email: 'other@example.com' })
      const personId = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: null,
      })
      const taskId = await seedTask(db, { ownerUserId: alice, delegatePersonId: personId })

      const visibleToOther = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(taskFilter(other)!)
      expect(visibleToOther).toEqual([])
      expect(await canAccessTask(db, other, taskId)).toBe(false)
    } finally {
      await pool.end()
    }
  })

  it('excludes a delegated task from a DIFFERENT linked user (delegation is scoped)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const joao = await seedUser(db, { email: 'joao@example.com' })
      const mariaPerson = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: maria,
      })
      await seedTask(db, { ownerUserId: alice, delegatePersonId: mariaPerson })

      const visibleToJoao = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(taskFilter(joao)!)
      expect(visibleToJoao).toEqual([])
    } finally {
      await pool.end()
    }
  })

  it('includes a task where the viewer is a CONVIDADO through a linked person', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const mariaPerson = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: maria,
      })
      const taskId = await seedTask(db, { ownerUserId: alice, title: 'Com convidada' })
      await addParticipant(db, { taskId, personId: mariaPerson })

      const visible = await db.select({ id: tasks.id }).from(tasks).where(taskFilter(maria)!)
      expect(visible.map((r) => r.id)).toEqual([taskId])
      expect(await canAccessTask(db, maria, taskId)).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('excludes a task whose convidado has NO linked account (invite pending)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const other = await seedUser(db, { email: 'other@example.com' })
      const person = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: null,
      })
      const taskId = await seedTask(db, { ownerUserId: alice })
      await addParticipant(db, { taskId, personId: person })

      const visibleToOther = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(taskFilter(other)!)
      expect(visibleToOther).toEqual([])
      expect(await canAccessTask(db, other, taskId)).toBe(false)
    } finally {
      await pool.end()
    }
  })

  it('scopes the convidado to their own task — neighbouring tasks stay hidden', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const mariaPerson = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: maria,
      })
      const invited = await seedTask(db, { ownerUserId: alice, title: 'Convidada' })
      await addParticipant(db, { taskId: invited, personId: mariaPerson })
      await seedTask(db, { ownerUserId: alice, title: 'Private' })

      const visible = await db.select({ id: tasks.id }).from(tasks).where(taskFilter(maria)!)
      expect(visible.map((r) => r.id)).toEqual([invited])
    } finally {
      await pool.end()
    }
  })

  it('does NOT duplicate the row when the viewer is BOTH delegate and convidado', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const mariaPerson = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: maria,
      })
      // Segunda pessoa, também vinculada à Maria (ex.: contato duplicado do dono)
      // e marcada como convidada — nem assim a tarefa pode aparecer duas vezes.
      const mariaDup = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria (2)',
        linkedUserId: maria,
      })
      const taskId = await seedTask(db, {
        ownerUserId: alice,
        delegatePersonId: mariaPerson,
      })
      await addParticipant(db, { taskId, personId: mariaPerson })
      await addParticipant(db, { taskId, personId: mariaDup })

      const visible = await db.select({ id: tasks.id }).from(tasks).where(taskFilter(maria)!)
      expect(visible.map((r) => r.id)).toEqual([taskId])
    } finally {
      await pool.end()
    }
  })

  it('LIST query returns both owned AND delegated-to-me tasks in a single shot', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const mariaPerson = await seedPerson(db, {
        ownerUserId: alice,
        name: 'Maria',
        linkedUserId: maria,
      })

      const mariaOwned = await seedTask(db, { ownerUserId: maria, title: 'Self' })
      const aliceDelegatedToMaria = await seedTask(db, {
        ownerUserId: alice,
        delegatePersonId: mariaPerson,
        title: 'Delegated',
      })
      const aliceInvitedMaria = await seedTask(db, { ownerUserId: alice, title: 'Invited' })
      await addParticipant(db, { taskId: aliceInvitedMaria, personId: mariaPerson })
      await seedTask(db, { ownerUserId: alice, title: 'Private' }) // unrelated

      const visible = await db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(taskFilter(maria)!)
      const ids = visible.map((r) => r.id).sort()
      expect(ids).toEqual([mariaOwned, aliceDelegatedToMaria, aliceInvitedMaria].sort())
    } finally {
      await pool.end()
    }
  })
})

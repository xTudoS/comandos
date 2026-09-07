import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { taskAnnotations, auditLog, people } from '~~/server/db/schema'
import {
  listAnnotations,
  createAnnotation,
  deleteAnnotation,
} from '~~/server/utils/annotationsService'
import { createTask } from '~~/server/utils/tasksService'
import { createPerson } from '~~/server/utils/peopleService'
import { useTestDb, seedUser } from './helpers'

async function linkPerson(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: { personId: string; userId: string },
) {
  await db.update(people).set({ linkedUserId: args.userId }).where(eq(people.id, args.personId))
}

describe('annotationsService', () => {
  it('createAnnotation writes the row + audit and denormalizes authorName on list', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })

      const row = await createAnnotation(db, { userId: alice, taskId: t.id, body: '  hello  ' })
      expect(row.body).toBe('hello')
      expect(row.authorUserId).toBe(alice)

      const list = await listAnnotations(db, { userId: alice, taskId: t.id })
      expect(list).toHaveLength(1)
      expect(list[0]!.authorName).toBe('alice')

      const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, row.id))
      expect(audit!.action).toBe('create')
      expect(audit!.entityType).toBe('task_annotation')
    } finally {
      await pool.end()
    }
  })

  it('list returns annotations sorted ASC by createdAt', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const a = await createAnnotation(db, { userId: alice, taskId: t.id, body: 'first' })
      await new Promise((r) => setTimeout(r, 10))
      const b = await createAnnotation(db, { userId: alice, taskId: t.id, body: 'second' })

      const list = await listAnnotations(db, { userId: alice, taskId: t.id })
      expect(list.map((x) => x.id)).toEqual([a.id, b.id])
    } finally {
      await pool.end()
    }
  })

  it('delegate can comment on a delegated task', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
      await linkPerson(db, { personId: p.id, userId: maria })
      const t = await createTask(db, {
        userId: alice,
        input: { title: 'T', type: 'delegate', delegatePersonId: p.id },
      })
      const row = await createAnnotation(db, { userId: maria, taskId: t.id, body: 'feito' })
      expect(row.authorUserId).toBe(maria)
    } finally {
      await pool.end()
    }
  })

  it('cross-tenant caller gets 404 on list / create / delete', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const a = await createAnnotation(db, { userId: alice, taskId: t.id, body: 'x' })

      await expect(
        listAnnotations(db, { userId: bob, taskId: t.id }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
      await expect(
        createAnnotation(db, { userId: bob, taskId: t.id, body: 'pwn' }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
      await expect(
        deleteAnnotation(db, { userId: bob, taskId: t.id, annotationId: a.id }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
    } finally {
      await pool.end()
    }
  })

  it('rejects whitespace-only body on create', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      await expect(
        createAnnotation(db, { userId: alice, taskId: t.id, body: '   ' }),
      ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
    } finally {
      await pool.end()
    }
  })

  describe('deleteAnnotation', () => {
    it('author can delete their own annotation', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: p.id, userId: maria })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: p.id },
        })
        const a = await createAnnotation(db, { userId: maria, taskId: t.id, body: 'mine' })

        await deleteAnnotation(db, { userId: maria, taskId: t.id, annotationId: a.id })
        const remaining = await db
          .select()
          .from(taskAnnotations)
          .where(eq(taskAnnotations.id, a.id))
        expect(remaining).toHaveLength(0)
      } finally {
        await pool.end()
      }
    })

    it('task creator can delete a delegate\'s annotation', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: p.id, userId: maria })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: p.id },
        })
        const a = await createAnnotation(db, { userId: maria, taskId: t.id, body: 'by delegate' })

        await deleteAnnotation(db, { userId: alice, taskId: t.id, annotationId: a.id })
        const remaining = await db
          .select()
          .from(taskAnnotations)
          .where(eq(taskAnnotations.id, a.id))
        expect(remaining).toHaveLength(0)
      } finally {
        await pool.end()
      }
    })

    it('non-author / non-creator (different delegate) cannot delete', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const joao = await seedUser(db, { email: 'joao@example.com' })
        const pMaria = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        const pJoao = await createPerson(db, { ownerUserId: alice, name: 'Joao' })
        await linkPerson(db, { personId: pMaria.id, userId: maria })
        await linkPerson(db, { personId: pJoao.id, userId: joao })
        // Task delegated to Maria — Joao has no access
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: pMaria.id },
        })
        const a = await createAnnotation(db, { userId: maria, taskId: t.id, body: 'mine' })

        // Joao can't even see the task — 404 first
        await expect(
          deleteAnnotation(db, { userId: joao, taskId: t.id, annotationId: a.id }),
        ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
      } finally {
        await pool.end()
      }
    })
  })
})

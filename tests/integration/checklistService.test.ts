import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { checklistItems, auditLog, people } from '~~/server/db/schema'
import {
  listChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from '~~/server/utils/checklistService'
import { createTask } from '~~/server/utils/tasksService'
import { createPerson } from '~~/server/utils/peopleService'
import { useTestDb, seedUser } from './helpers'

async function linkPerson(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: { personId: string; userId: string },
) {
  await db.update(people).set({ linkedUserId: args.userId }).where(eq(people.id, args.personId))
}

describe('checklistService', () => {
  it('createChecklistItem assigns incremental positions and writes a create audit', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })

      const a = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'first' })
      const b = await createChecklistItem(db, { userId: alice, taskId: t.id, text: '  second  ' })
      const c = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'third' })

      expect(a.position).toBe(0)
      expect(b.position).toBe(1)
      expect(b.text).toBe('second')
      expect(c.position).toBe(2)

      const audits = await db.select().from(auditLog).where(eq(auditLog.entityType, 'checklist_item'))
      expect(audits.filter((x) => x.action === 'create')).toHaveLength(3)
    } finally {
      await pool.end()
    }
  })

  it('listChecklist returns items in position order, scoped to parent task', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t1 = await createTask(db, { userId: alice, input: { title: 'T1' } })
      const t2 = await createTask(db, { userId: alice, input: { title: 'T2' } })

      await createChecklistItem(db, { userId: alice, taskId: t1.id, text: 'a' })
      await createChecklistItem(db, { userId: alice, taskId: t1.id, text: 'b' })
      await createChecklistItem(db, { userId: alice, taskId: t2.id, text: 'other' })

      const items = await listChecklist(db, { userId: alice, taskId: t1.id })
      expect(items.map((i) => i.text)).toEqual(['a', 'b'])
    } finally {
      await pool.end()
    }
  })

  it('cross-tenant caller sees 404 (no enumeration)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })

      await expect(
        listChecklist(db, { userId: bob, taskId: t.id }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })

      await expect(
        createChecklistItem(db, { userId: bob, taskId: t.id, text: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
    } finally {
      await pool.end()
    }
  })

  it('delegate (via linked person) can edit checklist on a delegated task', async () => {
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
      const item = await createChecklistItem(db, { userId: maria, taskId: t.id, text: 'anotado' })
      expect(item.text).toBe('anotado')
    } finally {
      await pool.end()
    }
  })

  it('updateChecklistItem flips done and sets doneAt; audit action is complete/uncomplete', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const item = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'x' })
      await db.delete(auditLog)

      const done = await updateChecklistItem(db, {
        userId: alice,
        taskId: t.id,
        itemId: item.id,
        patch: { done: true },
      })
      expect(done.done).toBe(true)
      expect(done.doneAt).toBeInstanceOf(Date)

      const undone = await updateChecklistItem(db, {
        userId: alice,
        taskId: t.id,
        itemId: item.id,
        patch: { done: false },
      })
      expect(undone.done).toBe(false)
      expect(undone.doneAt).toBeNull()

      const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, item.id))
      expect(audits.map((a) => a.action)).toEqual(['complete', 'uncomplete'])
    } finally {
      await pool.end()
    }
  })

  it('updateChecklistItem is idempotent on same-state done (no audit noise)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const item = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'x' })
      await updateChecklistItem(db, {
        userId: alice,
        taskId: t.id,
        itemId: item.id,
        patch: { done: true },
      })
      await db.delete(auditLog)
      const second = await updateChecklistItem(db, {
        userId: alice,
        taskId: t.id,
        itemId: item.id,
        patch: { done: true },
      })
      expect(second.done).toBe(true)
      const audits = await db.select().from(auditLog)
      expect(audits).toHaveLength(0)
    } finally {
      await pool.end()
    }
  })

  it('updateChecklistItem rejects whitespace-only text', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const item = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'x' })
      await expect(
        updateChecklistItem(db, {
          userId: alice,
          taskId: t.id,
          itemId: item.id,
          patch: { text: '   ' },
        }),
      ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
    } finally {
      await pool.end()
    }
  })

  it('updateChecklistItem with an item id from another task returns NOT_FOUND', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t1 = await createTask(db, { userId: alice, input: { title: 'T1' } })
      const t2 = await createTask(db, { userId: alice, input: { title: 'T2' } })
      const itemOnT1 = await createChecklistItem(db, { userId: alice, taskId: t1.id, text: 'x' })
      await expect(
        updateChecklistItem(db, {
          userId: alice,
          taskId: t2.id,
          itemId: itemOnT1.id,
          patch: { done: true },
        }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
    } finally {
      await pool.end()
    }
  })

  it('deleteChecklistItem removes the row and writes a delete audit snapshot', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const item = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'doomed' })
      await deleteChecklistItem(db, { userId: alice, taskId: t.id, itemId: item.id })

      const remaining = await db.select().from(checklistItems).where(eq(checklistItems.id, item.id))
      expect(remaining).toHaveLength(0)

      const deleteAudit = (
        await db.select().from(auditLog).where(eq(auditLog.entityId, item.id))
      ).find((a) => a.action === 'delete')
      expect(deleteAudit).toBeDefined()
      expect((deleteAudit!.changes as Record<string, { text?: string }>).delete?.text).toBe(
        'doomed',
      )
    } finally {
      await pool.end()
    }
  })
})

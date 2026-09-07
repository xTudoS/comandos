import { describe, it, expect } from 'vitest'
import { listTaskTimeline } from '~~/server/utils/auditTimeline'
import {
  createTask,
  updateTask,
  completeTask,
  archiveTask,
  deleteTask,
} from '~~/server/utils/tasksService'
import {
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from '~~/server/utils/checklistService'
import { createAnnotation } from '~~/server/utils/annotationsService'
import { useTestDb, seedUser } from './helpers'

describe('auditTimeline.listTaskTimeline', () => {
  it('returns task + checklist + annotation audit rows, sorted chronologically', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      await new Promise((r) => setTimeout(r, 5))
      await updateTask(db, { userId: alice, taskId: t.id, patch: { title: 'T2' } })
      await new Promise((r) => setTimeout(r, 5))
      const item = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'step 1' })
      await new Promise((r) => setTimeout(r, 5))
      await updateChecklistItem(db, {
        userId: alice,
        taskId: t.id,
        itemId: item.id,
        patch: { done: true },
      })
      await new Promise((r) => setTimeout(r, 5))
      const ann = await createAnnotation(db, {
        userId: alice,
        taskId: t.id,
        body: 'nota',
      })
      await new Promise((r) => setTimeout(r, 5))
      await completeTask(db, { userId: alice, taskId: t.id, done: true })

      const entries = await listTaskTimeline(db, { userId: alice, taskId: t.id })
      const actions = entries.map((e) => `${e.entityType}:${e.action}`)
      expect(actions).toEqual([
        'task:create',
        'task:update',
        'checklist_item:create',
        'checklist_item:complete',
        'task_annotation:create',
        'task:complete',
      ])
      // Confirm strict chronological order
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i]!.at.getTime()).toBeGreaterThanOrEqual(entries[i - 1]!.at.getTime())
      }
      // Actor name is denormalized
      expect(entries.every((e) => e.actorName === 'alice')).toBe(true)
      void ann
    } finally {
      await pool.end()
    }
  })

  it('keeps child rows in the timeline after the child has been deleted', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const item = await createChecklistItem(db, { userId: alice, taskId: t.id, text: 'doomed' })
      await deleteChecklistItem(db, { userId: alice, taskId: t.id, itemId: item.id })

      const entries = await listTaskTimeline(db, { userId: alice, taskId: t.id })
      const itemActions = entries
        .filter((e) => e.entityType === 'checklist_item')
        .map((e) => e.action)
      expect(itemActions).toEqual(['create', 'delete'])
    } finally {
      await pool.end()
    }
  })

  it('does not leak rows from other tasks of the same user', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t1 = await createTask(db, { userId: alice, input: { title: 'T1' } })
      const t2 = await createTask(db, { userId: alice, input: { title: 'T2' } })
      await createChecklistItem(db, { userId: alice, taskId: t1.id, text: 'A' })
      await createChecklistItem(db, { userId: alice, taskId: t2.id, text: 'B' })
      await createAnnotation(db, { userId: alice, taskId: t2.id, body: 'other' })

      const entries = await listTaskTimeline(db, { userId: alice, taskId: t1.id })
      const refs = entries.map((e) => ({ t: e.entityType, e: e.entityId }))
      // Only rows whose entityId is t1 (task-level) or whose context.taskId
      // is t1 should show up.
      expect(refs.every((r) => r.t !== 'task' || r.e === t1.id)).toBe(true)
      expect(
        entries.every(
          (e) =>
            e.entityType === 'task' ||
            (e.context as { taskId: string }).taskId === t1.id,
        ),
      ).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('delegate (via linked person) can read the timeline of a delegated task', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const maria = await seedUser(db, { email: 'maria@example.com' })
      const { people } = await import('~~/server/db/schema')
      const { createPerson } = await import('~~/server/utils/peopleService')
      const { eq } = await import('drizzle-orm')
      const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
      await db.update(people).set({ linkedUserId: maria }).where(eq(people.id, p.id))

      const t = await createTask(db, {
        userId: alice,
        input: { title: 'T', type: 'delegate', delegatePersonId: p.id },
      })
      const entries = await listTaskTimeline(db, { userId: maria, taskId: t.id })
      expect(entries.some((e) => e.entityType === 'task' && e.action === 'create')).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('denies access to users outside the task scope with 404', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      await expect(
        listTaskTimeline(db, { userId: bob, taskId: t.id }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
    } finally {
      await pool.end()
    }
  })

  it('includes archive / delete actions on the parent task', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      await archiveTask(db, { userId: alice, taskId: t.id, archived: true })
      const midway = await listTaskTimeline(db, { userId: alice, taskId: t.id })
      expect(midway.map((e) => `${e.entityType}:${e.action}`)).toContain('task:archive')

      await deleteTask(db, { userId: alice, taskId: t.id })
      // Task row is gone but its id is still available to the test.
      // canAccessTask will now fail, so we need to assert the 404 path as
      // well — timeline access tracks visibility of the live task.
      await expect(
        listTaskTimeline(db, { userId: alice, taskId: t.id }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
    } finally {
      await pool.end()
    }
  })
})

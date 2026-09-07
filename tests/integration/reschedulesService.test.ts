import { describe, it, expect } from 'vitest'
import { listReschedules } from '~~/server/utils/reschedulesService'
import { createTask, updateTask } from '~~/server/utils/tasksService'
import { useTestDb, seedUser } from './helpers'

describe('reschedulesService.listReschedules', () => {
  it('returns each scheduledDate change in chronological order', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, {
        userId: alice,
        input: { title: 'T', scheduledDate: '2026-05-01' },
      })
      await new Promise((r) => setTimeout(r, 5))
      await updateTask(db, {
        userId: alice,
        taskId: t.id,
        patch: { scheduledDate: '2026-05-08' },
      })
      await new Promise((r) => setTimeout(r, 5))
      await updateTask(db, {
        userId: alice,
        taskId: t.id,
        patch: { scheduledDate: '2026-05-15' },
      })

      const reschedules = await listReschedules(db, { userId: alice, taskId: t.id })
      expect(reschedules).toHaveLength(2)
      expect(reschedules[0]!.from).toBe('2026-05-01')
      expect(reschedules[0]!.to).toBe('2026-05-08')
      expect(reschedules[1]!.from).toBe('2026-05-08')
      expect(reschedules[1]!.to).toBe('2026-05-15')
    } finally {
      await pool.end()
    }
  })

  it('returns an empty array when the task has never been rescheduled', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      const reschedules = await listReschedules(db, { userId: alice, taskId: t.id })
      expect(reschedules).toEqual([])
    } finally {
      await pool.end()
    }
  })

  it('ignores non-schedule changes (title / description edits)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const t = await createTask(db, { userId: alice, input: { title: 'T' } })
      await updateTask(db, { userId: alice, taskId: t.id, patch: { title: 'New' } })
      await updateTask(db, {
        userId: alice,
        taskId: t.id,
        patch: { description: 'something' },
      })
      const reschedules = await listReschedules(db, { userId: alice, taskId: t.id })
      expect(reschedules).toEqual([])
    } finally {
      await pool.end()
    }
  })

  it('denies access to users outside the task\'s scope with 404', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const t = await createTask(db, {
        userId: alice,
        input: { title: 'T', scheduledDate: '2026-05-01' },
      })
      await expect(
        listReschedules(db, { userId: bob, taskId: t.id }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
    } finally {
      await pool.end()
    }
  })
})

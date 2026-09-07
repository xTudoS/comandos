import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { users, auditLog } from '~~/server/db/schema'
import { auditedUpdate } from '~~/server/utils/audit'
import { useTestDb, seedUser } from './helpers'

describe('auditedUpdate', () => {
  it('writes a diff row when the patch actually changes something', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'a@example.com' })

      const after = await auditedUpdate<{
        id: string
        name: string
        email: string
      }>(db, users, userId, userId, { name: 'New Name' }, { entity: 'user' })

      expect(after.name).toBe('New Name')

      const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, userId))
      expect(audits).toHaveLength(1)
      expect(audits[0]!.entityType).toBe('user')
      expect(audits[0]!.action).toBe('update')
      expect(audits[0]!.actorUserId).toBe(userId)
      const changes = audits[0]!.changes as Record<string, { from: unknown; to: unknown }>
      expect(changes.name).toEqual({ from: 'a', to: 'New Name' })
      // The default-ignored mtime column must not appear in the diff.
      expect(changes).not.toHaveProperty('updatedAt')
    } finally {
      await pool.end()
    }
  })

  it('writes nothing when the patch is a no-op', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'b@example.com' })
      const before = await db.select().from(users).where(eq(users.id, userId))

      await auditedUpdate(db, users, userId, userId, { name: before[0]!.name }, { entity: 'user' })

      const audits = await db.select().from(auditLog)
      expect(audits).toHaveLength(0)
    } finally {
      await pool.end()
    }
  })

  it('throws when the row does not exist', async () => {
    const { db, pool } = await useTestDb()
    try {
      await expect(
        auditedUpdate(
          db,
          users,
          '00000000-0000-0000-0000-000000000000',
          null,
          { name: 'ghost' },
          { entity: 'user' },
        ),
      ).rejects.toThrow(/user#.*not found/)
    } finally {
      await pool.end()
    }
  })

  it('respects custom opts.ignore on top of defaults', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'c@example.com' })
      // Only changing `image`, which we ask to ignore → should be a no-op
      // from the audit's perspective.
      await auditedUpdate(
        db,
        users,
        userId,
        userId,
        { image: 'https://cdn.example.com/me.png' },
        { entity: 'user', ignore: ['image'] },
      )
      const audits = await db.select().from(auditLog)
      expect(audits).toHaveLength(0)

      // And sanity: the actual column DID update.
      const [row] = await db.select().from(users).where(eq(users.id, userId))
      expect(row!.image).toBe('https://cdn.example.com/me.png')
    } finally {
      await pool.end()
    }
  })

  it('persists the context field alongside changes', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'd@example.com' })
      await auditedUpdate(
        db,
        users,
        userId,
        userId,
        { name: 'Renamed' },
        { entity: 'user', context: { reason: 'onboarding_rename', via: 'settings' } },
      )
      const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, userId))
      expect((audit!.context as Record<string, unknown>).reason).toBe('onboarding_rename')
    } finally {
      await pool.end()
    }
  })
})

import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { auditLog, deviceApprovals, passkeys } from '~~/server/db/schema'
import { resetUserDevices, listUsersWithPasskeyCounts } from '~~/server/utils/adminService'
import { useTestDb, seedUser, seedApproval, addPasskey } from './helpers'

describe('adminService.resetUserDevices', () => {
  it('wipes every passkey and device_approval for the target user and writes a single audit row', async () => {
    const { db, pool } = await useTestDb()
    try {
      const owner = await seedUser(db, { email: 'owner@example.com', role: 'owner' })
      const victim = await seedUser(db, { email: 'victim@example.com' })
      const other = await seedUser(db, { email: 'other@example.com' })

      await addPasskey(db, { userId: victim })
      await addPasskey(db, { userId: victim })
      await addPasskey(db, { userId: other })
      await seedApproval(db, { userId: victim })
      await seedApproval(db, { userId: victim, status: 'rejected' })
      await seedApproval(db, { userId: other })

      const result = await resetUserDevices(db, { userId: victim, actorUserId: owner })
      expect(result).toEqual({ passkeysDeleted: 2, approvalsDeleted: 2 })

      const victimPasskeys = await db
        .select()
        .from(passkeys)
        .where(eq(passkeys.userId, victim))
      expect(victimPasskeys).toHaveLength(0)

      const victimApprovals = await db
        .select()
        .from(deviceApprovals)
        .where(eq(deviceApprovals.userId, victim))
      expect(victimApprovals).toHaveLength(0)

      // Other user's stuff survives — blast radius stops at the target.
      const otherPasskeys = await db
        .select()
        .from(passkeys)
        .where(eq(passkeys.userId, other))
      expect(otherPasskeys).toHaveLength(1)
      const otherApprovals = await db
        .select()
        .from(deviceApprovals)
        .where(eq(deviceApprovals.userId, other))
      expect(otherApprovals).toHaveLength(1)

      const audits = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'user'), eq(auditLog.entityId, victim)))
      expect(audits).toHaveLength(1)
      const entry = audits[0]!
      expect(entry.action).toBe('update')
      expect(entry.actorUserId).toBe(owner)
      expect(entry.changes).toMatchObject({
        passkeys: { from: 2, to: 0 },
        deviceApprovals: { from: 2, to: 0 },
      })
      expect(entry.context).toMatchObject({ action: 'reset-devices' })
    } finally {
      await pool.end()
    }
  })

  it('is a no-op when the user has no passkeys or approvals — still writes an audit row', async () => {
    const { db, pool } = await useTestDb()
    try {
      const owner = await seedUser(db, { email: 'o@example.com', role: 'owner' })
      const empty = await seedUser(db, { email: 'empty@example.com' })

      const result = await resetUserDevices(db, { userId: empty, actorUserId: owner })
      expect(result).toEqual({ passkeysDeleted: 0, approvalsDeleted: 0 })

      const audits = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'user'), eq(auditLog.entityId, empty)))
      expect(audits).toHaveLength(1)
    } finally {
      await pool.end()
    }
  })
})

describe('adminService.listUsersWithPasskeyCounts', () => {
  it('returns every user with an accurate passkey count (incl. zero)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const a = await seedUser(db, { email: 'a@example.com', role: 'owner' })
      const b = await seedUser(db, { email: 'b@example.com' })
      const c = await seedUser(db, { email: 'c@example.com' })
      await addPasskey(db, { userId: a })
      await addPasskey(db, { userId: a })
      await addPasskey(db, { userId: b })

      const rows = await listUsersWithPasskeyCounts(db)
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
      expect(byId[a]?.passkeyCount).toBe(2)
      expect(byId[b]?.passkeyCount).toBe(1)
      expect(byId[c]?.passkeyCount).toBe(0)
      expect(byId[a]?.role).toBe('owner')
      expect(byId[b]?.role).toBe('delegate')
    } finally {
      await pool.end()
    }
  })
})

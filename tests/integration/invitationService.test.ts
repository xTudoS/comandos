import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  people,
  personInvitations,
  users,
  auditLog,
} from '~~/server/db/schema'
import {
  prepareInvitation,
  acceptInvitation,
} from '~~/server/utils/invitationService'
import { createPerson } from '~~/server/utils/peopleService'
import { useTestDb, seedUser } from './helpers'

const ORIGIN = 'http://localhost:3000'

describe('invitationService.prepareInvitation', () => {
  it('creates a new user, links the person, inserts a hashed-token invitation, returns raw token', async () => {
    const { db, pool } = await useTestDb()
    try {
      const owner = await seedUser(db, { email: 'owner@example.com' })
      const person = await createPerson(db, { ownerUserId: owner, name: 'Maria' })

      const res = await prepareInvitation(db, {
        ownerUserId: owner,
        inviterName: 'Brunno',
        personId: person.id,
        email: 'maria@example.com',
        siteUrl: ORIGIN,
      })

      expect(res.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(res.inviteLink).toBe(`${ORIGIN}/invite/${res.rawToken}`)
      expect(res.email).toBe('maria@example.com')

      const [invite] = await db.select().from(personInvitations)
      expect(invite!.status).toBe('pending')
      expect(invite!.tokenHash).toBe(
        createHash('sha256').update(res.rawToken).digest('hex'),
      )
      expect(invite!.email).toBe('maria@example.com')
      expect(invite!.personId).toBe(person.id)

      const [createdUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'maria@example.com'))
      expect(createdUser!.role).toBe('delegate')

      const [linkedPerson] = await db.select().from(people).where(eq(people.id, person.id))
      expect(linkedPerson!.linkedUserId).toBe(createdUser!.id)

      // Audit trail: user create + person update (linkedUserId)
      const audits = await db.select().from(auditLog)
      expect(audits.find((a) => a.entityType === 'user' && a.action === 'create')).toBeDefined()
      expect(
        audits.find(
          (a) =>
            a.entityType === 'person' &&
            (a.changes as Record<string, { from: unknown; to: unknown }>).linkedUserId?.to ===
              createdUser!.id,
        ),
      ).toBeDefined()
    } finally {
      await pool.end()
    }
  })

  it('reuses an existing user row when one matches the email (no duplicate create)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const owner = await seedUser(db, { email: 'owner@example.com' })
      const existing = await seedUser(db, { email: 'maria@example.com' })
      const person = await createPerson(db, { ownerUserId: owner, name: 'Maria' })

      await prepareInvitation(db, {
        ownerUserId: owner,
        inviterName: 'Brunno',
        personId: person.id,
        email: 'maria@example.com',
        siteUrl: ORIGIN,
      })

      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.email, 'maria@example.com'))
      expect(userRows).toHaveLength(1)

      const [linked] = await db.select().from(people).where(eq(people.id, person.id))
      expect(linked!.linkedUserId).toBe(existing)
    } finally {
      await pool.end()
    }
  })

  it('lowercases the email before storing and linking', async () => {
    const { db, pool } = await useTestDb()
    try {
      const owner = await seedUser(db, { email: 'owner@example.com' })
      const person = await createPerson(db, { ownerUserId: owner, name: 'Maria' })

      await prepareInvitation(db, {
        ownerUserId: owner,
        inviterName: 'Brunno',
        personId: person.id,
        email: 'Maria@EXAMPLE.com',
        siteUrl: ORIGIN,
      })

      const [invite] = await db.select().from(personInvitations)
      expect(invite!.email).toBe('maria@example.com')
      const [u] = await db.select().from(users).where(eq(users.email, 'maria@example.com'))
      expect(u).toBeDefined()
    } finally {
      await pool.end()
    }
  })

  it('rejects when the person is archived', async () => {
    const { db, pool } = await useTestDb()
    try {
      const owner = await seedUser(db, { email: 'owner@example.com' })
      const person = await createPerson(db, { ownerUserId: owner, name: 'Maria' })
      await db.update(people).set({ archived: true }).where(eq(people.id, person.id))

      await expect(
        prepareInvitation(db, {
          ownerUserId: owner,
          inviterName: 'Brunno',
          personId: person.id,
          email: 'maria@example.com',
          siteUrl: ORIGIN,
        }),
      ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
    } finally {
      await pool.end()
    }
  })

  it('rejects when the person already has a linked user (no double-invite)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const owner = await seedUser(db, { email: 'owner@example.com' })
      const person = await createPerson(db, { ownerUserId: owner, name: 'Maria' })
      await prepareInvitation(db, {
        ownerUserId: owner,
        inviterName: 'Brunno',
        personId: person.id,
        email: 'maria@example.com',
        siteUrl: ORIGIN,
      })

      await expect(
        prepareInvitation(db, {
          ownerUserId: owner,
          inviterName: 'Brunno',
          personId: person.id,
          email: 'other@example.com',
          siteUrl: ORIGIN,
        }),
      ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
    } finally {
      await pool.end()
    }
  })

  it('rejects cross-owner invite attempts with NOT_FOUND', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const person = await createPerson(db, { ownerUserId: alice, name: 'Maria' })

      await expect(
        prepareInvitation(db, {
          ownerUserId: bob,
          inviterName: 'Bob',
          personId: person.id,
          email: 'maria@example.com',
          siteUrl: ORIGIN,
        }),
      ).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'ERR_NOT_FOUND' } } })
    } finally {
      await pool.end()
    }
  })
})

describe('invitationService.acceptInvitation', () => {
  async function setupPendingInvite(
    db: Awaited<ReturnType<typeof useTestDb>>['db'],
  ) {
    const owner = await seedUser(db, { email: 'owner@example.com' })
    const person = await createPerson(db, { ownerUserId: owner, name: 'Maria' })
    const prepared = await prepareInvitation(db, {
      ownerUserId: owner,
      inviterName: 'Brunno',
      personId: person.id,
      email: 'maria@example.com',
      siteUrl: ORIGIN,
    })
    return { owner, person, prepared }
  }

  it('flips pending → accepted, marks email verified, optionally sets the user name', async () => {
    const { db, pool } = await useTestDb()
    try {
      const { prepared } = await setupPendingInvite(db)

      const res = await acceptInvitation(db, {
        rawToken: prepared.rawToken,
        optionalName: '  Maria Souza  ',
      })
      expect(res.email).toBe('maria@example.com')

      const [inv] = await db.select().from(personInvitations)
      expect(inv!.status).toBe('accepted')
      expect(inv!.acceptedAt).toBeInstanceOf(Date)

      const [u] = await db.select().from(users).where(eq(users.id, res.userId))
      expect(u!.emailVerified).toBe(true)
      expect(u!.name).toBe('Maria Souza')
    } finally {
      await pool.end()
    }
  })

  it('rejects a wrong token with INVITATION_EXPIRED', async () => {
    const { db, pool } = await useTestDb()
    try {
      await setupPendingInvite(db)
      await expect(
        acceptInvitation(db, { rawToken: 'wrongtoken' }),
      ).rejects.toMatchObject({
        statusCode: 410,
        data: { error: { code: 'ERR_INVITATION_EXPIRED' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('rejects an expired invitation', async () => {
    const { db, pool } = await useTestDb()
    try {
      const { prepared } = await setupPendingInvite(db)
      await db
        .update(personInvitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(personInvitations.tokenHash, createHash('sha256').update(prepared.rawToken).digest('hex')))

      await expect(
        acceptInvitation(db, { rawToken: prepared.rawToken }),
      ).rejects.toMatchObject({
        statusCode: 410,
        data: { error: { code: 'ERR_INVITATION_EXPIRED' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('rejects a double-accept attempt on the same token (one-shot)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const { prepared } = await setupPendingInvite(db)
      await acceptInvitation(db, { rawToken: prepared.rawToken })
      await expect(
        acceptInvitation(db, { rawToken: prepared.rawToken }),
      ).rejects.toMatchObject({
        statusCode: 410,
        data: { error: { code: 'ERR_INVITATION_EXPIRED' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('does not overwrite the user name when optionalName is missing', async () => {
    const { db, pool } = await useTestDb()
    try {
      const { prepared } = await setupPendingInvite(db)
      const [beforeUser] = await db.select().from(users).where(eq(users.email, 'maria@example.com'))
      await acceptInvitation(db, { rawToken: prepared.rawToken })
      const [afterUser] = await db.select().from(users).where(eq(users.email, 'maria@example.com'))
      expect(afterUser!.name).toBe(beforeUser!.name)
      expect(afterUser!.emailVerified).toBe(true)
    } finally {
      await pool.end()
    }
  })
})

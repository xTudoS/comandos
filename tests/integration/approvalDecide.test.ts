import { describe, it, expect } from 'vitest'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { deviceApprovals, auditLog, authChallenges } from '~~/server/db/schema'
import { decideApproval } from '~~/server/utils/approvalDecide'
import {
  useTestDb,
  seedUser,
  seedSession,
  seedPasskeyFromKeypair,
  seedApproval,
  seedDeviceApprovalChallenge,
  signApproval,
  buildDecisionPayload,
} from './helpers'

const ORIGIN = 'http://localhost:3000'
const RP_ID = new URL(ORIGIN).hostname
const RP_ID_HASH = createHash('sha256').update(RP_ID).digest()

describe('decideApproval', () => {
  it('approves a valid signed assertion and writes the audit row', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const { sessionId } = await seedSession(db, { userId })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { passkeyId, credentialId } = await seedPasskeyFromKeypair(db, { userId, keypair })
      const approvalId = await seedApproval(db, { userId })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )
      await seedDeviceApprovalChallenge(db, { userId, challenge, payload })
      const assertion = signApproval({ keypair, challenge, origin: ORIGIN })

      const result = await decideApproval(db, {
        approvalId,
        decidingUser: { id: userId },
        decidingSession: { id: sessionId },
        credentialId,
        decisionPayload: payload,
        assertion,
        expectedOrigin: ORIGIN,
        expectedRpIdHash: RP_ID_HASH,
      })

      expect(result).toEqual({ status: 'approved', approvalId })

      const [row] = await db.select().from(deviceApprovals).where(eq(deviceApprovals.id, approvalId))
      expect(row!.status).toBe('approved')
      expect(row!.decidedWithPasskeyId).toBe(passkeyId)
      expect(row!.decidedBySessionId).toBe(sessionId)
      expect(row!.decisionSignature).toBeInstanceOf(Buffer)
      expect(row!.decisionClientData).toBeInstanceOf(Buffer)
      expect(row!.decisionAuthenticatorData).toBeInstanceOf(Buffer)
      expect(row!.decidedAt).toBeInstanceOf(Date)

      const [audit] = await db.select().from(auditLog)
      expect(audit!.entityType).toBe('device_approval')
      expect(audit!.entityId).toBe(approvalId)
      expect(audit!.action).toBe('approve')
      expect(audit!.actorUserId).toBe(userId)
      const context = audit!.context as Record<string, unknown>
      expect(context.passkey_id).toBe(passkeyId)
      expect(context.signature).toBe(assertion.signature)
    } finally {
      await pool.end()
    }
  })

  it('rejects a tampered payload with ERR_SIGNATURE_INVALID', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const { sessionId } = await seedSession(db, { userId })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { credentialId } = await seedPasskeyFromKeypair(db, { userId, keypair })
      const approvalId = await seedApproval(db, { userId })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )
      await seedDeviceApprovalChallenge(db, { userId, challenge, payload })
      const assertion = signApproval({ keypair, challenge, origin: ORIGIN })

      // Mutate the payload after signing — challenge will be re-derived differently.
      const tampered = { ...payload, decision: 'reject' as const }

      await expect(
        decideApproval(db, {
          approvalId,
          decidingUser: { id: userId },
          decidingSession: { id: sessionId },
          credentialId,
          decisionPayload: tampered,
          assertion,
          expectedOrigin: ORIGIN,
          expectedRpIdHash: RP_ID_HASH,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_SIGNATURE_INVALID' } },
      })

      const [row] = await db.select().from(deviceApprovals).where(eq(deviceApprovals.id, approvalId))
      expect(row!.status).toBe('pending')
      const audits = await db.select().from(auditLog)
      expect(audits).toHaveLength(0)
    } finally {
      await pool.end()
    }
  })

  it('rejects when the challenge was never stored (or already consumed)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const { sessionId } = await seedSession(db, { userId })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { credentialId } = await seedPasskeyFromKeypair(db, { userId, keypair })
      const approvalId = await seedApproval(db, { userId })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )
      // Intentionally NOT seeding the challenge in authChallenges.
      const assertion = signApproval({ keypair, challenge, origin: ORIGIN })

      await expect(
        decideApproval(db, {
          approvalId,
          decidingUser: { id: userId },
          decidingSession: { id: sessionId },
          credentialId,
          decisionPayload: payload,
          assertion,
          expectedOrigin: ORIGIN,
          expectedRpIdHash: RP_ID_HASH,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_SIGNATURE_INVALID' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('cannot replay a consumed challenge', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const { sessionId } = await seedSession(db, { userId })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { credentialId } = await seedPasskeyFromKeypair(db, { userId, keypair })
      const approvalId = await seedApproval(db, { userId })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )
      await seedDeviceApprovalChallenge(db, { userId, challenge, payload })
      const assertion = signApproval({ keypair, challenge, origin: ORIGIN })

      await decideApproval(db, {
        approvalId,
        decidingUser: { id: userId },
        decidingSession: { id: sessionId },
        credentialId,
        decisionPayload: payload,
        assertion,
        expectedOrigin: ORIGIN,
        expectedRpIdHash: RP_ID_HASH,
      })

      // Rollback the approval row to try a replay; the challenge has already
      // been consumed so even an "otherwise valid" retry must fail.
      await db
        .update(deviceApprovals)
        .set({ status: 'pending', decidedAt: null })
        .where(eq(deviceApprovals.id, approvalId))

      await expect(
        decideApproval(db, {
          approvalId,
          decidingUser: { id: userId },
          decidingSession: { id: sessionId },
          credentialId,
          decisionPayload: payload,
          assertion,
          expectedOrigin: ORIGIN,
          expectedRpIdHash: RP_ID_HASH,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_SIGNATURE_INVALID' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('rejects when approval.target_user_id mismatches the decider', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const { sessionId } = await seedSession(db, { userId: bob })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { credentialId } = await seedPasskeyFromKeypair(db, { userId: bob, keypair })
      const approvalId = await seedApproval(db, { userId: alice })

      const { payload } = buildDecisionPayload(
        {
          id: approvalId,
          userId: alice,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )

      await expect(
        decideApproval(db, {
          approvalId,
          decidingUser: { id: bob },
          decidingSession: { id: sessionId },
          credentialId,
          decisionPayload: payload,
          assertion: { signature: '', clientDataJSON: '', authenticatorData: '' },
          expectedOrigin: ORIGIN,
          expectedRpIdHash: RP_ID_HASH,
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        data: { error: { code: 'ERR_FORBIDDEN' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('rejects a signature from a passkey belonging to a different user', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const { sessionId } = await seedSession(db, { userId: alice })
      const aliceKp = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const bobKp = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      await seedPasskeyFromKeypair(db, { userId: alice, keypair: aliceKp })
      const { credentialId: bobCred } = await seedPasskeyFromKeypair(db, { userId: bob, keypair: bobKp })
      const approvalId = await seedApproval(db, { userId: alice })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId: alice,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )
      await seedDeviceApprovalChallenge(db, { userId: alice, challenge, payload })
      const assertion = signApproval({ keypair: bobKp, challenge, origin: ORIGIN })

      await expect(
        decideApproval(db, {
          approvalId,
          decidingUser: { id: alice },
          decidingSession: { id: sessionId },
          credentialId: bobCred,
          decisionPayload: payload,
          assertion,
          expectedOrigin: ORIGIN,
          expectedRpIdHash: RP_ID_HASH,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: { code: 'ERR_SIGNATURE_INVALID' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('flips status to rejected and writes a reject audit row', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const { sessionId } = await seedSession(db, { userId })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { credentialId } = await seedPasskeyFromKeypair(db, { userId, keypair })
      const approvalId = await seedApproval(db, { userId })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'reject',
      )
      await seedDeviceApprovalChallenge(db, { userId, challenge, payload })
      const assertion = signApproval({ keypair, challenge, origin: ORIGIN })

      const result = await decideApproval(db, {
        approvalId,
        decidingUser: { id: userId },
        decidingSession: { id: sessionId },
        credentialId,
        decisionPayload: payload,
        assertion,
        expectedOrigin: ORIGIN,
        expectedRpIdHash: RP_ID_HASH,
      })

      expect(result).toEqual({ status: 'rejected', approvalId })
      const [row] = await db.select().from(deviceApprovals).where(eq(deviceApprovals.id, approvalId))
      expect(row!.status).toBe('rejected')
      const [audit] = await db.select().from(auditLog)
      expect(audit!.action).toBe('reject')
    } finally {
      await pool.end()
    }
  })

  it('rejects when the DB approval row belongs to a different user (payload matches decider but row does not)', async () => {
    const { db, pool } = await useTestDb()
    try {
      const alice = await seedUser(db, { email: 'alice@example.com' })
      const bob = await seedUser(db, { email: 'bob@example.com' })
      const { sessionId } = await seedSession(db, { userId: bob })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { credentialId } = await seedPasskeyFromKeypair(db, { userId: bob, keypair })
      // Row belongs to alice; attacker bob crafts a payload whose target_user_id = bob.
      const approvalId = await seedApproval(db, { userId: alice })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId: bob, // forged to match decider
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )
      await seedDeviceApprovalChallenge(db, { userId: bob, challenge, payload })
      const assertion = signApproval({ keypair, challenge, origin: ORIGIN })

      await expect(
        decideApproval(db, {
          approvalId,
          decidingUser: { id: bob },
          decidingSession: { id: sessionId },
          credentialId,
          decisionPayload: payload,
          assertion,
          expectedOrigin: ORIGIN,
          expectedRpIdHash: RP_ID_HASH,
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        data: { error: { code: 'ERR_FORBIDDEN' } },
      })
    } finally {
      await pool.end()
    }
  })

  it('throws APPROVAL_EXPIRED when the approval is past its deadline', async () => {
    const { db, pool } = await useTestDb()
    try {
      const userId = await seedUser(db, { email: 'owner@example.com' })
      const { sessionId } = await seedSession(db, { userId })
      const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const { credentialId } = await seedPasskeyFromKeypair(db, { userId, keypair })
      const approvalId = await seedApproval(db, {
        userId,
        expiresAt: new Date(Date.now() - 1000),
      })

      const { payload, challenge } = buildDecisionPayload(
        {
          id: approvalId,
          userId,
          requestFingerprint: 'fp-req',
          requestUserAgent: 'ua-req',
          requestIp: '203.0.113.9',
        },
        'approve',
      )
      await seedDeviceApprovalChallenge(db, { userId, challenge, payload })
      const assertion = signApproval({ keypair, challenge, origin: ORIGIN })

      await expect(
        decideApproval(db, {
          approvalId,
          decidingUser: { id: userId },
          decidingSession: { id: sessionId },
          credentialId,
          decisionPayload: payload,
          assertion,
          expectedOrigin: ORIGIN,
          expectedRpIdHash: RP_ID_HASH,
        }),
      ).rejects.toMatchObject({
        statusCode: 410,
        data: { error: { code: 'ERR_APPROVAL_EXPIRED' } },
      })

      // Challenge must NOT be consumed when we bail before consume.
      const remaining = await db.select().from(authChallenges)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]!.consumedAt).toBeNull()
    } finally {
      await pool.end()
    }
  })
})

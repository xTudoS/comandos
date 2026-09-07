import { describe, it, expect } from 'vitest'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import {
  canonicalJson,
  buildDecisionPayload,
  verifyApprovalAssertion,
  type ApprovalInput,
} from '~~/server/utils/signatureAudit'

const stubApproval: ApprovalInput = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  requestFingerprint: 'fp-1',
  requestUserAgent: 'ua',
  requestIp: '1.2.3.4',
}

describe('canonicalJson', () => {
  it('sorts keys deterministically at every depth', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } })
    const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
  })

  it('handles null, booleans, and numbers', () => {
    expect(canonicalJson({ b: null, a: true, c: 0 })).toBe('{"a":true,"b":null,"c":0}')
  })
})

describe('buildDecisionPayload', () => {
  it('captures approval metadata and generates a matching challenge hash', () => {
    const { payload, challenge } = buildDecisionPayload(stubApproval, 'approve')
    expect(payload.approval_id).toBe(stubApproval.id)
    expect(payload.decision).toBe('approve')
    expect(payload.target_user_id).toBe(stubApproval.userId)
    expect(payload.requester_fingerprint).toBe('fp-1')
    expect(payload.requester_ua).toBe('ua')
    expect(payload.requester_ip).toBe('1.2.3.4')
    expect(payload.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const expected = createHash('sha256').update(canonicalJson(payload)).digest('base64url')
    expect(challenge).toBe(expected)
  })

  it('coerces a null userAgent to an empty string in the payload', () => {
    const { payload } = buildDecisionPayload({ ...stubApproval, requestUserAgent: null }, 'reject')
    expect(payload.requester_ua).toBe('')
  })

  it('generates a distinct nonce on every call', () => {
    const a = buildDecisionPayload(stubApproval, 'approve').payload.nonce
    const b = buildDecisionPayload(stubApproval, 'approve').payload.nonce
    expect(a).not.toBe(b)
  })
})

describe('verifyApprovalAssertion', () => {
  function buildAssertion(decision: 'approve' | 'reject', approval: ApprovalInput = stubApproval) {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
    const { payload, challenge } = buildDecisionPayload(approval, decision)
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://example.com' }),
    )
    const authenticatorData = Buffer.alloc(37)
    const toSign = Buffer.concat([
      authenticatorData,
      createHash('sha256').update(clientDataJSON).digest(),
    ])
    const signature = sign('SHA256', toSign, privateKey)
    return {
      payload,
      challenge,
      assertion: {
        signature: signature.toString('base64'),
        clientDataJSON: clientDataJSON.toString('base64'),
        authenticatorData: authenticatorData.toString('base64'),
      },
      publicKeySpkiBase64: spkiDer.toString('base64'),
    }
  }

  it('accepts a valid signature over the challenge', async () => {
    const a = buildAssertion('approve')
    const ok = await verifyApprovalAssertion({
      decisionPayload: a.payload,
      expectedChallenge: a.challenge,
      assertion: a.assertion,
      publicKeySpkiBase64: a.publicKeySpkiBase64,
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: false,
    })
    expect(ok).toBe(true)
  })

  it('rejects a tampered payload (decision flipped)', async () => {
    const a = buildAssertion('approve')
    const ok = await verifyApprovalAssertion({
      decisionPayload: { ...a.payload, decision: 'reject' },
      expectedChallenge: a.challenge,
      assertion: a.assertion,
      publicKeySpkiBase64: a.publicKeySpkiBase64,
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: false,
    })
    expect(ok).toBe(false)
  })

  it('rejects when clientData.origin does not match expectedOrigin', async () => {
    const a = buildAssertion('approve')
    const ok = await verifyApprovalAssertion({
      decisionPayload: a.payload,
      expectedChallenge: a.challenge,
      assertion: a.assertion,
      publicKeySpkiBase64: a.publicKeySpkiBase64,
      expectedOrigin: 'https://evil.example.com',
      verifyRpIdHash: false,
    })
    expect(ok).toBe(false)
  })

  it('rejects when clientData.type is not webauthn.get', async () => {
    const a = buildAssertion('approve')
    const badClientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: a.challenge,
        origin: 'https://example.com',
      }),
    )
    const ok = await verifyApprovalAssertion({
      decisionPayload: a.payload,
      expectedChallenge: a.challenge,
      assertion: { ...a.assertion, clientDataJSON: badClientData.toString('base64') },
      publicKeySpkiBase64: a.publicKeySpkiBase64,
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: false,
    })
    expect(ok).toBe(false)
  })

  it('rejects when rpIdHash check is enabled but no expected hash is given', async () => {
    const a = buildAssertion('approve')
    const ok = await verifyApprovalAssertion({
      decisionPayload: a.payload,
      expectedChallenge: a.challenge,
      assertion: a.assertion,
      publicKeySpkiBase64: a.publicKeySpkiBase64,
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: true,
    })
    expect(ok).toBe(false)
  })

  it('accepts when rpIdHash matches', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
    const { payload, challenge } = buildDecisionPayload(stubApproval, 'approve')
    const rpIdHash = createHash('sha256').update('example.com').digest()
    const authenticatorData = Buffer.concat([rpIdHash, Buffer.alloc(5)])
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://example.com' }),
    )
    const toSign = Buffer.concat([
      authenticatorData,
      createHash('sha256').update(clientDataJSON).digest(),
    ])
    const signature = sign('SHA256', toSign, privateKey)
    const ok = await verifyApprovalAssertion({
      decisionPayload: payload,
      expectedChallenge: challenge,
      assertion: {
        signature: signature.toString('base64'),
        clientDataJSON: clientDataJSON.toString('base64'),
        authenticatorData: authenticatorData.toString('base64'),
      },
      publicKeySpkiBase64: spkiDer.toString('base64'),
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: true,
      expectedRpIdHash: rpIdHash,
    })
    expect(ok).toBe(true)
  })

  it('rejects when rpIdHash is wrong (correct length, wrong value)', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
    const { payload, challenge } = buildDecisionPayload(stubApproval, 'approve')
    const wrongRpIdHash = createHash('sha256').update('evil.example.com').digest()
    const authenticatorData = Buffer.concat([wrongRpIdHash, Buffer.alloc(5)])
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://example.com' }),
    )
    const toSign = Buffer.concat([
      authenticatorData,
      createHash('sha256').update(clientDataJSON).digest(),
    ])
    const signature = sign('SHA256', toSign, privateKey)
    const expectedRpIdHash = createHash('sha256').update('example.com').digest()
    const ok = await verifyApprovalAssertion({
      decisionPayload: payload,
      expectedChallenge: challenge,
      assertion: {
        signature: signature.toString('base64'),
        clientDataJSON: clientDataJSON.toString('base64'),
        authenticatorData: authenticatorData.toString('base64'),
      },
      publicKeySpkiBase64: spkiDer.toString('base64'),
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: true,
      expectedRpIdHash,
    })
    expect(ok).toBe(false)
  })

  it('returns false when clientDataJSON is not valid JSON', async () => {
    const a = buildAssertion('approve')
    const ok = await verifyApprovalAssertion({
      decisionPayload: a.payload,
      expectedChallenge: a.challenge,
      assertion: { ...a.assertion, clientDataJSON: Buffer.from('not-json').toString('base64') },
      publicKeySpkiBase64: a.publicKeySpkiBase64,
      expectedOrigin: 'https://example.com',
      verifyRpIdHash: false,
    })
    expect(ok).toBe(false)
  })
})

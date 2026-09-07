import { describe, it, expect } from 'vitest'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { verifyApprovalAssertion, buildDecisionPayload } from '~~/server/utils/signatureAudit'

const ORIGIN = 'https://hq-brunno-galvao.gitlab-admin-company.workers.dev'

// Codifica um COSE_Key ES256 (EC2/P-256) — o MESMO formato que o
// better-auth/@simplewebauthn persiste em passkeys.public_key.
function encodeCoseEs256(x: Buffer, y: Buffer): Buffer {
  const bstr32 = (b: Buffer) => Buffer.concat([Buffer.from([0x58, 0x20]), b]) // bytes(32)
  return Buffer.concat([
    Buffer.from([0xa5]), // map(5)
    Buffer.from([0x01, 0x02]), // 1 (kty) : 2 (EC2)
    Buffer.from([0x03, 0x26]), // 3 (alg) : -7 (ES256)
    Buffer.from([0x20, 0x01]), // -1 (crv): 1 (P-256)
    Buffer.concat([Buffer.from([0x21]), bstr32(x)]), // -2 (x)
    Buffer.concat([Buffer.from([0x22]), bstr32(y)]), // -3 (y)
  ])
}

function signAssertion(privateKey: import('node:crypto').KeyObject, challenge: string) {
  const clientData = JSON.stringify({
    type: 'webauthn.get',
    challenge,
    origin: ORIGIN,
    crossOrigin: false,
  })
  const clientDataRaw = Buffer.from(clientData, 'utf-8')
  // authenticatorData arbitrário (rpIdHash não é verificado neste teste).
  const authData = Buffer.alloc(37)
  const signed = Buffer.concat([authData, createHash('sha256').update(clientDataRaw).digest()])
  const signature = sign('SHA256', signed, privateKey) // ECDSA DER
  return {
    signature: signature.toString('base64'),
    clientDataJSON: clientDataRaw.toString('base64'),
    authenticatorData: authData.toString('base64'),
  }
}

describe('verifyApprovalAssertion — chave em formato COSE (produção)', () => {
  const payloadInput = {
    id: '0304c5a9-d054-49ba-af80-b797be8259b7',
    userId: 'c5a53304-6d34-466f-8d9a-799613e6b6f2',
    requestFingerprint: 'be32124d',
    requestUserAgent: 'SamsungBrowser/30.0',
    requestIp: '177.12.118.4',
  }

  it('aceita uma assinatura válida quando a chave está em COSE (não SPKI)', async () => {
    const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const jwk = keypair.publicKey.export({ format: 'jwk' }) as { x: string; y: string }
    const cose = encodeCoseEs256(
      Buffer.from(jwk.x, 'base64url'),
      Buffer.from(jwk.y, 'base64url'),
    )

    const { payload, challenge } = buildDecisionPayload(payloadInput, 'approve')
    const assertion = signAssertion(keypair.privateKey, challenge)

    const ok = await verifyApprovalAssertion({
      decisionPayload: payload,
      expectedChallenge: challenge,
      assertion,
      publicKeySpkiBase64: cose.toString('base64'),
      expectedOrigin: ORIGIN,
      verifyRpIdHash: false,
    })
    expect(ok).toBe(true)
  })

  it('continua aceitando o formato SPKI (compat com testes existentes)', async () => {
    const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spki = (keypair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer).toString('base64')

    const { payload, challenge } = buildDecisionPayload(payloadInput, 'approve')
    const assertion = signAssertion(keypair.privateKey, challenge)

    const ok = await verifyApprovalAssertion({
      decisionPayload: payload,
      expectedChallenge: challenge,
      assertion,
      publicKeySpkiBase64: spki,
      expectedOrigin: ORIGIN,
      verifyRpIdHash: false,
    })
    expect(ok).toBe(true)
  })

  it('rejeita assinatura de outra chave (COSE)', async () => {
    const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const jwk = keypair.publicKey.export({ format: 'jwk' }) as { x: string; y: string }
    const cose = encodeCoseEs256(
      Buffer.from(jwk.x, 'base64url'),
      Buffer.from(jwk.y, 'base64url'),
    )

    const { payload, challenge } = buildDecisionPayload(payloadInput, 'approve')
    // Assina com a chave ERRADA.
    const assertion = signAssertion(other.privateKey, challenge)

    const ok = await verifyApprovalAssertion({
      decisionPayload: payload,
      expectedChallenge: challenge,
      assertion,
      publicKeySpkiBase64: cose.toString('base64'),
      expectedOrigin: ORIGIN,
      verifyRpIdHash: false,
    })
    expect(ok).toBe(false)
  })
})

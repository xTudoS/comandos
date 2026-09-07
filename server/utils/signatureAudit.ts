import { createHash, createPublicKey, createVerify, randomBytes, type KeyObject } from 'node:crypto'

/**
 * Importa a chave pública de uma passkey para verificação de assinatura.
 *
 * O fluxo de device-approval precisa lidar com DOIS formatos:
 *  - SPKI DER (base64): usado pelos testes (node:crypto `export({type:'spki'})`).
 *  - COSE_Key (CBOR, base64): o formato REAL que o better-auth/@simplewebauthn
 *    persiste em `passkeys.public_key` (`base64.encode(credential.publicKey)`).
 *
 * Sem suportar COSE, toda aprovação real falhava com "Assinatura inválida",
 * porque `createPublicKey({type:'spki'})` lançava sobre bytes COSE.
 *
 * Retorna `null` para qualquer entrada malformada/algoritmo não suportado, para
 * o chamador tratar como gate booleano.
 */
function importPasskeyPublicKey(publicKeyBase64: string): KeyObject | null {
  // `base64` do Node aceita base64 padrão; normalizamos url-safe por garantia.
  const bytes = Buffer.from(publicKeyBase64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (bytes.length === 0) return null
  try {
    // SPKI DER começa com SEQUENCE (0x30). COSE_Key é um mapa CBOR (0xA0–0xBF).
    if (bytes[0] === 0x30) {
      return createPublicKey({ key: bytes, format: 'der', type: 'spki' })
    }
    return coseToPublicKey(decodeCoseKey(bytes))
  } catch {
    return null
  }
}

// --- Decodificador CBOR mínimo, suficiente para um COSE_Key ---
// (mapa de inteiros pequenos -> inteiros ou byte strings). Evita uma dependência
// de CBOR no bundle do Worker.

type CborCursor = { buf: Buffer; pos: number }

function readCborHead(c: CborCursor): { major: number; len: number } {
  const b = c.buf[c.pos++]!
  const major = b >> 5
  const ai = b & 0x1f
  let len = ai
  if (ai === 24) len = c.buf[c.pos++]!
  else if (ai === 25) {
    len = c.buf.readUInt16BE(c.pos)
    c.pos += 2
  } else if (ai === 26) {
    len = c.buf.readUInt32BE(c.pos)
    c.pos += 4
  } else if (ai >= 27) {
    throw new Error('cbor: comprimento não suportado')
  }
  return { major, len }
}

function readCborValue(c: CborCursor): number | Buffer {
  const { major, len } = readCborHead(c)
  switch (major) {
    case 0:
      return len // inteiro sem sinal
    case 1:
      return -1 - len // inteiro negativo
    case 2: {
      const out = Buffer.from(c.buf.subarray(c.pos, c.pos + len))
      c.pos += len
      return out
    }
    default:
      throw new Error('cbor: tipo inesperado ' + major)
  }
}

function decodeCoseKey(bytes: Buffer): Map<number, number | Buffer> {
  const c: CborCursor = { buf: bytes, pos: 0 }
  const head = readCborHead(c)
  if (head.major !== 5) throw new Error('cose: não é um mapa')
  const map = new Map<number, number | Buffer>()
  for (let i = 0; i < head.len; i++) {
    const key = readCborValue(c) as number
    map.set(key, readCborValue(c))
  }
  return map
}

// Prefixo SPKI DER fixo de uma chave pública EC P-256 (até o ponto não comprimido
// 0x04). Concatenado com X(32)||Y(32) forma um SPKI válido — reaproveitando o
// caminho `createPublicKey({type:'spki'})` que já é comprovadamente suportado.
const P256_SPKI_PREFIX = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d03010703420004',
  'hex',
)

function coseToPublicKey(cose: Map<number, number | Buffer>): KeyObject {
  const kty = cose.get(1)
  // EC2 (kty=2): apenas P-256 (crv=1, ES256/-7) — o caso de passkeys de
  // plataforma (Android/iOS/Windows Hello na maioria).
  if (kty === 2) {
    const crv = cose.get(-1)
    const x = cose.get(-2)
    const y = cose.get(-3)
    if (crv !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y)) {
      throw new Error('cose: chave EC não suportada')
    }
    if (x.length !== 32 || y.length !== 32) throw new Error('cose: coordenadas EC inválidas')
    const spki = Buffer.concat([P256_SPKI_PREFIX, x, y])
    return createPublicKey({ key: spki, format: 'der', type: 'spki' })
  }
  // RSA (kty=3, RS256): importa via JWK (n, e).
  if (kty === 3) {
    const n = cose.get(-1)
    const e = cose.get(-2)
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e)) throw new Error('cose: chave RSA inválida')
    return createPublicKey({
      key: { kty: 'RSA', n: n.toString('base64url'), e: e.toString('base64url') },
      format: 'jwk',
    })
  }
  throw new Error('cose: kty não suportado ' + String(kty))
}

/**
 * Deterministic JSON serializer — keys sorted recursively at every depth.
 * The challenge hash and signature both depend on byte-exact serialization,
 * so JSON.stringify (which does not guarantee key order) is not sufficient.
 *
 * Input must be strictly JSON-safe: string | number | boolean | null | arrays |
 * plain objects. undefined / bigint / Date / Map / Set / circular refs are not
 * supported and will either throw or produce garbage — we don't defend against
 * them because `DecisionPayload` is the only caller.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

export type DecisionKind = 'approve' | 'reject'

export type DecisionPayload = {
  approval_id: string
  decision: DecisionKind
  target_user_id: string
  requester_fingerprint: string
  requester_ua: string
  requester_ip: string | null
  /**
   * Timestamp the challenge was minted — not when the user actually signed it.
   * Consumers (Task 12) should use the server clock at verification time as the
   * authoritative `device_approvals.decided_at` and treat this only as part of
   * the replay window bounds.
   */
  decided_at: string
  nonce: string
}

export type ApprovalInput = {
  id: string
  userId: string
  requestFingerprint: string
  requestUserAgent: string | null
  requestIp: string | null
}

export function buildDecisionPayload(
  approval: ApprovalInput,
  decision: DecisionKind,
): { payload: DecisionPayload; challenge: string } {
  const payload: DecisionPayload = {
    approval_id: approval.id,
    decision,
    target_user_id: approval.userId,
    requester_fingerprint: approval.requestFingerprint,
    requester_ua: approval.requestUserAgent ?? '',
    requester_ip: approval.requestIp,
    decided_at: new Date().toISOString(),
    nonce: randomBytes(32).toString('base64url'),
  }
  const challenge = createHash('sha256').update(canonicalJson(payload)).digest('base64url')
  return { payload, challenge }
}

export type AssertionInput = {
  signature: string         // base64
  clientDataJSON: string    // base64 of raw bytes
  authenticatorData: string // base64
}

/**
 * Verifies a WebAuthn-style assertion produced by a passkey over the approval
 * decision challenge. Returns false for any malformed/tampered input rather
 * than throwing, so callers can treat it as a boolean gate.
 *
 * Flow:
 *   1. Recompute challenge = sha256(canonical_json(payload)) and match.
 *   2. Parse clientDataJSON; verify type, origin, and challenge fields.
 *   3. Optionally check rpIdHash against authenticatorData[0..32].
 *   4. Verify signature over (authData || sha256(clientDataJSON)) with the SPKI
 *      public key stored for the passkey.
 */
export async function verifyApprovalAssertion(args: {
  decisionPayload: DecisionPayload
  expectedChallenge: string
  assertion: AssertionInput
  publicKeySpkiBase64: string
  expectedOrigin: string
  verifyRpIdHash?: boolean
  expectedRpIdHash?: Buffer
}): Promise<boolean> {
  const recomputed = createHash('sha256')
    .update(canonicalJson(args.decisionPayload))
    .digest('base64url')
  if (recomputed !== args.expectedChallenge) return false

  const clientDataRaw = Buffer.from(args.assertion.clientDataJSON, 'base64')
  let clientData: { type?: string; origin?: string; challenge?: string }
  try {
    clientData = JSON.parse(clientDataRaw.toString('utf-8'))
  } catch {
    return false
  }
  if (clientData.type !== 'webauthn.get') return false
  if (clientData.origin !== args.expectedOrigin) return false
  if (clientData.challenge !== args.expectedChallenge) return false

  const authData = Buffer.from(args.assertion.authenticatorData, 'base64')
  if (args.verifyRpIdHash !== false) {
    if (!args.expectedRpIdHash) return false
    if (!authData.subarray(0, 32).equals(args.expectedRpIdHash)) return false
  }

  const hashedClient = createHash('sha256').update(clientDataRaw).digest()
  const signed = Buffer.concat([authData, hashedClient])

  const pubKey = importPasskeyPublicKey(args.publicKeySpkiBase64)
  if (!pubKey) return false

  try {
    const verifier = createVerify('SHA256')
    verifier.update(signed)
    // Assinaturas WebAuthn EC vêm em DER (padrão do node); RSA são raw — ambos
    // tratados por createVerify conforme o tipo da chave.
    return verifier.verify(pubKey, Buffer.from(args.assertion.signature, 'base64'))
  } catch {
    return false
  }
}

type PendingApproval = {
  id: string
  requestFingerprint: string
  requestUserAgent: string | null
  requestIp: string | null
  requestedAt: string
  expiresAt: string
}

type ChallengeResponse = {
  challenge: string
  decisionPayload: Record<string, unknown>
  allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }>
  userVerification: 'required'
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

export function useDeviceApprovals() {
  const pending = useState<PendingApproval[]>('device-approvals:pending', () => [])
  const loading = useState('device-approvals:loading', () => false)
  const error = useState<string | null>('device-approvals:error', () => null)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ pending: PendingApproval[] }>('/api/auth/device-approvals')
      pending.value = res.pending
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar aprovações.'
    } finally {
      loading.value = false
    }
  }

  async function decide(approvalId: string, decision: 'approve' | 'reject') {
    const challenge = await $fetch<ChallengeResponse>(
      `/api/auth/device-approvals/${approvalId}/challenge`,
      { method: 'POST', body: { decision } },
    )

    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToBytes(challenge.challenge) as BufferSource,
        allowCredentials: challenge.allowCredentials.map((c) => ({
          id: base64UrlToBytes(c.id) as BufferSource,
          type: 'public-key' as const,
          transports: c.transports as AuthenticatorTransport[] | undefined,
        })),
        userVerification: 'required',
      },
    })) as PublicKeyCredential | null
    if (!cred) throw new Error('Autenticação cancelada.')

    const response = cred.response as AuthenticatorAssertionResponse
    const assertion = {
      signature: bufferToBase64(response.signature),
      clientDataJSON: bufferToBase64(response.clientDataJSON),
      authenticatorData: bufferToBase64(response.authenticatorData),
    }

    const result = await $fetch<{ status: 'approved' | 'rejected' }>(
      `/api/auth/device-approvals/${approvalId}/decide`,
      {
        method: 'POST',
        body: {
          credentialId: cred.id,
          decisionPayload: challenge.decisionPayload,
          assertion,
        },
      },
    )

    await refresh()
    return result
  }

  async function waitFor(approvalId: string) {
    type PollResult =
      | { status: 'pending' }
      | { status: 'approved' }
      | { status: 'rejected' }
      | { status: 'expired' }
    return await $fetch<PollResult>(`/api/auth/device-approvals/${approvalId}`)
  }

  return { pending, loading, error, refresh, decide, waitFor }
}

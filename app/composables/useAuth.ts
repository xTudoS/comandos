import { authClient } from '~/lib/authClient'
import { clearAuthMarker } from '~/lib/authMarker'

type VerifyOtpResult =
  | { status: 'ok' }
  | { status: 'approval-required'; approvalId: string }

export function useAuth() {
  const session = authClient.useSession()

  async function sendOtp(email: string) {
    return $fetch('/api/auth/email-otp/send', {
      method: 'POST',
      body: { email },
    })
  }

  async function verifyOtp(email: string, otp: string): Promise<VerifyOtpResult> {
    try {
      await $fetch('/api/auth/email-otp/verify', {
        method: 'POST',
        body: { email, otp },
      })
      return { status: 'ok' }
    } catch (e: any) {
      console.log('OTP verify error raw:', e);
      
      // Conversão robusta: procura a string no objeto serializado para não depender
      // de níveis exatos de aninhamento (já que o Nitro muda isso em prod)
      try {
        const errStr = JSON.stringify(e);
        if (errStr.includes('ERR_DEVICE_APPROVAL_REQUIRED')) {
          // Extrai o approvalId usando regex já que sabemos o formato do UUID
          const match = errStr.match(/"approvalId"\s*:\s*"([a-f0-9\-]{36})"/);
          if (match && match[1]) {
            return { status: 'approval-required', approvalId: match[1] };
          }
        }
      } catch (_) {}

      // Fallback para leitura tradicional
      const payloadData = e?.data?.data || e?.data;
      const errorObj = payloadData?.error || payloadData;
      const code = errorObj?.code;
      const approvalId = errorObj?.details?.approvalId || errorObj?.approvalId;

      if (code === 'ERR_DEVICE_APPROVAL_REQUIRED' && approvalId) {
        return { status: 'approval-required', approvalId };
      }
      
      throw e;
    }
  }

  async function registerPasskey(name?: string) {
    const result = await authClient.passkey.addPasskey({ name })
    if (result.error) throw new Error(result.error.message ?? 'Falha ao registrar passkey.')
    return result.data
  }

  async function signInWithPasskey() {
    const result = await authClient.signIn.passkey()
    if (result.error) throw new Error(result.error.message ?? 'Falha ao autenticar com passkey.')
    return result.data
  }

  async function logout() {
    clearAuthMarker()
    await authClient.signOut()
    await navigateTo('/login')
  }

  return { session, sendOtp, verifyOtp, registerPasskey, signInWithPasskey, logout }
}

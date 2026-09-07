// Marcador de sessão offline.
//
// Após uma validação de sessão bem-sucedida no servidor, gravamos localmente
// um marcador com expiração (período de graça). Quando o dispositivo está
// offline e o servidor não pode validar a sessão, o middleware usa este
// marcador para permitir o uso local do app — sem reexigir passkey.
//
// Ao reconectar, a sessão é revalidada no servidor; se o servidor disser que a
// sessão acabou, o marcador é apagado e o usuário volta para /login.

const STORAGE_KEY = 'comando-auth-marker'

// Período de graça offline: 7 dias.
export const AUTH_MARKER_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface AuthMarker {
  userId: string
  expiresAt: number
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

/** Renova o marcador a partir de agora (chamado quando o servidor confirma a sessão). */
export function renewAuthMarker(userId: string): void {
  if (!storageAvailable()) return
  const marker: AuthMarker = { userId, expiresAt: Date.now() + AUTH_MARKER_TTL_MS }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(marker))
  } catch {
    // localStorage cheio/bloqueado — ignora silenciosamente.
  }
}

export function readAuthMarker(): AuthMarker | null {
  if (!storageAvailable()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthMarker
    if (!parsed?.userId || typeof parsed.expiresAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

/** True se há um marcador válido e não expirado (janela de graça offline ativa). */
export function isAuthMarkerValid(): boolean {
  const marker = readAuthMarker()
  return !!marker && marker.expiresAt > Date.now()
}

export function clearAuthMarker(): void {
  if (!storageAvailable()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignora
  }
}

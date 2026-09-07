// Identidade da aba para o tempo real: cada aba/instância do app tem um id
// estável (por carga de página). Vai no header `x-client-id` das mutações e o
// servidor o devolve como `origin` no broadcast — assim o próprio originador
// ignora o eco (ver useRealtimeSync), enquanto as OUTRAS abas/dispositivos do
// mesmo usuário recebem normalmente. Por-aba (não por-cookie) de propósito:
// duas abas no mesmo navegador devem se atualizar entre si.

let cached: string | null = null

export function getClientId(): string {
  if (cached) return cached
  cached =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return cached
}

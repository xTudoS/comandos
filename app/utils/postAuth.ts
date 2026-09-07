/**
 * Onde jogar o usuário depois de autenticar.
 *
 * A cadeia é passkey → tour → app, e ela tem DOIS pontos de entrada:
 * `login/index.vue` (quem entrou por passkey e já tem uma cadastrada) e
 * `onboarding/passkey.vue` (quem acabou de cadastrar, ou pulou). Os dois
 * precisam decidir igual, então a regra mora aqui e não duplicada nos dois.
 */
export async function withOnboarding(dest: string): Promise<string> {
  try {
    const me = await $fetch<{ onboardingCompleted?: boolean }>('/api/auth/me')
    if (me.onboardingCompleted) return dest
    return `/onboarding?redirect=${encodeURIComponent(dest)}`
  } catch {
    // Sem resposta do servidor, o destino original vence. Errar para o lado de
    // deixar entrar: o tour é conteúdo, não portão — segurar alguém na porta
    // porque uma chamada informativa falhou seria pior do que não mostrá-lo.
    return dest
  }
}

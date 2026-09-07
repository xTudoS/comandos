import { readAuthMarker } from '~/lib/authMarker'

/**
 * Identidade do usuário logado no CLIENTE, lida do marcador de sessão offline
 * (`app/lib/authMarker.ts`, alimentado pelo middleware global a cada validação).
 *
 * Por que o marcador e não `useAuth().session`: o app-shell é prerenderizado e
 * roda offline — o marcador é a única fonte de identidade disponível sem rede.
 * Como `localStorage` não existe no SSR/prerender, o valor só é preenchido no
 * `onMounted`; até lá `userId` é null e os badges derivados ficam ocultos (sem
 * mismatch de hidratação).
 */
export function useViewer() {
  const userId = useState<string | null>('viewer:userId', () => null)

  onMounted(() => {
    if (!userId.value) userId.value = readAuthMarker()?.userId ?? null
  })

  /** True quando a tarefa é de outra pessoa (chegou por delegação ou convite). */
  function isForeign(task: { ownerUserId: string | null }): boolean {
    return !!userId.value && !!task.ownerUserId && task.ownerUserId !== userId.value
  }

  return { userId, isForeign }
}

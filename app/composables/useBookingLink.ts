export type BookingLink = {
  id: string
  ownerUserId: string
  token: string
  /** Título da página pública. Vazio = cai no nome do dono. */
  name: string
  description: string
  /** Duração sugerida: pré-preenche o campo "Fim" na página pública. */
  defaultDurationMinutes: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

/**
 * O link de agendamento do usuário. Singular: cada pessoa tem exatamente um.
 *
 * O GET cria na primeira visita, então a tela nunca precisa lidar com "ainda não
 * existe" — ou carrega, ou deu erro.
 */
export function useBookingLink() {
  const link = useState<BookingLink | null>('bookingLink:current', () => null)
  const loading = useState('bookingLink:loading', () => false)
  const error = useState<string | null>('bookingLink:error', () => null)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ link: BookingLink }>('/api/booking-link')
      link.value = res.link
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar o link.'
    } finally {
      loading.value = false
    }
  }

  async function update(patch: {
    name?: string
    description?: string
    defaultDurationMinutes?: number | null
    active?: boolean
  }) {
    const res = await $fetch<{ link: BookingLink }>('/api/booking-link', {
      method: 'PATCH',
      body: patch,
    })
    link.value = res.link
    return res.link
  }

  /** Invalida a URL antiga. Chamada explícita — nunca embutida num salvamento. */
  async function regenerate() {
    const res = await $fetch<{ link: BookingLink }>('/api/booking-link/regenerate', {
      method: 'POST',
    })
    link.value = res.link
    return res.link
  }

  return { link, loading, error, refresh, update, regenerate }
}

// `cancelled` = o solicitante desmarcou pelo link do email, depois do aceite.
// É diferente de `rejected` (o dono disse não) de propósito — ver o comentário
// do enum em server/db/schema/booking.ts.
export type BookingRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export type BookingRequest = {
  id: string
  bookingLinkId: string | null
  ownerUserId: string
  title: string
  description: string
  requesterName: string
  requesterEmail: string
  requesterWhatsapp: string
  requestedDate: string
  /** Início 'HH:MM:SS'. */
  requestedTime: string
  requestedDurationMinutes: number
  status: BookingRequestStatus
  /** Carimbo do "Confirmar presença" do solicitante. Null = ainda não respondeu. */
  requesterConfirmedAt: string | null
  decisionMessage: string | null
  decidedAt: string | null
  createdTaskId: string | null
  createdAt: string
  updatedAt: string
}

export function useBookingRequests() {
  const list = useState<BookingRequest[]>('bookingReqs:list', () => [])
  const loading = useState('bookingReqs:loading', () => false)
  const error = useState<string | null>('bookingReqs:error', () => null)
  const pendingCount = useState('bookingReqs:pendingCount', () => 0)

  async function refresh(status?: BookingRequestStatus) {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ requests: BookingRequest[] }>('/api/booking-requests', {
        query: status ? { status } : undefined,
      })
      list.value = res.requests
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar solicitações.'
    } finally {
      loading.value = false
    }
  }

  // Conta pendentes sem mexer na lista visível (badge da navegação).
  async function refreshPendingCount() {
    try {
      const res = await $fetch<{ requests: BookingRequest[] }>('/api/booking-requests', {
        query: { status: 'pending' },
      })
      pendingCount.value = res.requests.length
    } catch {
      // silencioso — badge é informativo
    }
  }

  async function decide(id: string, decision: 'accepted' | 'rejected', message?: string) {
    await $fetch(`/api/booking-requests/${id}/decision`, {
      method: 'POST',
      body: { decision, message: message || undefined },
    })
    // Remove da lista atual (de pendentes) de forma otimista.
    list.value = list.value.filter((r) => r.id !== id)
    if (pendingCount.value > 0) pendingCount.value -= 1
  }

  return { list, loading, error, pendingCount, refresh, refreshPendingCount, decide }
}

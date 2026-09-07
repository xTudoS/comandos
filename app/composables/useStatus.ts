// useStatus — per design-spec-comando.md §10.4
//
// Status derivado em runtime: pagamento atrasado, meta vencida/concluída.
// Não é persistido — recalcula a partir do prazo + estado atual.

import type { Pagamento, StatusPagamento } from '~/types/pagamento'
import type { Meta, StatusMeta } from '~/types/meta'
import { fmtDate } from '~/utils/dates'
import { diasEntre } from '~/composables/useFormatBR'

export function statusPagamento(p: Pick<Pagamento, 'status' | 'data'>): StatusPagamento {
  if (p.status === 'pago') return 'pago'
  if (!p.data) return 'pendente'
  const hoje = fmtDate(new Date())
  if (p.data < hoje) return 'atrasado'
  return 'pendente'
}

export function diasAtePrazo(prazo: string | null): number | null {
  if (!prazo) return null
  return diasEntre(prazo, new Date())
}

/**
 * Status de meta. Considera concluida=true só quando o consumer já calculou
 * progresso=100 (não temos acesso a tarefas/projetos aqui).
 */
export function statusMeta(m: Pick<Meta, 'prazo'>, isConcluida = false): StatusMeta {
  if (isConcluida) return 'concluida'
  if (!m.prazo) return 'ativa'
  const hoje = fmtDate(new Date())
  if (m.prazo < hoje) return 'vencida'
  return 'ativa'
}

export function useStatus() {
  return { statusPagamento, statusMeta, diasAtePrazo }
}

// types/pagamento.ts — per design-spec-comando.md §10.1

export type StatusPagamento = 'pendente' | 'pago' | 'atrasado' // 'atrasado' é derivado

export interface Pagamento {
  id: string
  descricao: string
  valor: number
  data: string | null // 'YYYY-MM-DD'
  status: 'pendente' | 'pago' // status persistido (atrasado é derivado em runtime)
  notas: string
  arquivado: boolean
  criada_em: string
  atualizada_em: string
}

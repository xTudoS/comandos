// types/nota.ts — per design-spec-comando.md §10.1

export type TipoNota =
  | 'Playbook'
  | 'Credencial'
  | 'Contato'
  | 'Decisão'
  | 'Referência'

export interface Nota {
  id: string
  titulo: string
  corpo: string
  tipo: TipoNota
  projeto_id: string | null
  /** Empresa-canônica vinculada (id da tabela `companies`). */
  company_id: string | null
  status: 'Ativa' | 'Rascunho'
  arquivada: boolean
  criada_em: string
  atualizada_em: string
}

// types/tarefa.ts — per design-spec-comando.md §10.1
//
// NOTE: o backend atual usa nomes em inglês (title, horizon, scheduledDate,
// projectId, followupActive, ...). Estes tipos refletem o spec (PT). A
// camada de tradução vive em `stores/*` (Fase 2).

export type Horizonte =
  | 'core7'
  | 'core30'
  | 'core60'
  | 'core90'
  | 'hibernando'

export type TipoTarefa = 'CEO' | 'Delego' | 'Pessoal'

export interface Followup {
  ativo: boolean
  data: string | null // 'YYYY-MM-DD'
  titular: string // '' = eu
}

export interface ChecklistItem {
  id: string
  texto: string
  done: boolean
}

export interface Anotacao {
  id: string
  stamp: string // 'dd/mm hh:mm'
  texto: string
}

export interface Tarefa {
  id: string
  titulo: string
  descricao: string
  horizonte: Horizonte
  tipo: TipoTarefa
  projeto_id: string | null
  meta_id: string | null
  delegado_para: string | null
  data: string | null // 'YYYY-MM-DD'
  hora: string | null // 'HH:MM'
  duracao: number | null // minutos
  followup: Followup
  anotacoes: Anotacao[]
  reagendamentos: string[] // strings já formatadas BR (dd/mm)
  checklist: ChecklistItem[]
  done: boolean
  arquivada: boolean
  criada_em: string // ISO
  atualizada_em: string // ISO
}

// types/meta.ts — per design-spec-comando.md §10.1
import type { LifeAreaKey } from '~/composables/useLifeTracker'

export interface Meta {
  id: string
  titulo: string
  descricao: string
  categoria: 'empresa' | 'produto' | 'geral' | 'pessoal'
  prazo: string | null // 'YYYY-MM-DD'
  /** Empresa-canônica vinculada (id da tabela `companies`). */
  company_id: string | null
  /** Área da vida — obrigatória quando categoria='pessoal'. */
  area_vida: LifeAreaKey | null
  arquivada: boolean
  criada_em: string
  atualizada_em: string
}

export type StatusMeta = 'ativa' | 'vencida' | 'concluida'

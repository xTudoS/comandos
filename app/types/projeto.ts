// types/projeto.ts — per design-spec-comando.md §10.1
import type { LifeAreaKey } from '~/composables/useLifeTracker'

export type CategoriaProjeto = 'empresa' | 'produto' | 'geral' | 'pessoal'

export interface Projeto {
  id: string
  nome: string
  categoria: CategoriaProjeto
  empresa_id: string | null // produto pode pertencer a uma empresa
  meta_id: string | null
  /** Empresa-canônica vinculada (id da tabela `companies`). */
  company_id: string | null
  /** Área da vida — obrigatória quando categoria='pessoal'. */
  area_vida: LifeAreaKey | null
  notas: string
  /** Label do campo extra (ex: "Nome do produto", ou customizado para geral/pessoal). */
  campo_label: string
  /** Valor do campo extra. */
  campo_valor: string
  arquivado: boolean
  criada_em: string
  atualizada_em: string
}

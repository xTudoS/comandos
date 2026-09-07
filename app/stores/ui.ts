// stores/ui.ts — UI state global (per design-spec-comando.md §10.2)
//
// Fase 2: começamos com o subset usado por /notas. Outras slices (agenda,
// pagamentos, projetos, metas, arquivo) vêm conforme cada página migra.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TipoNota } from '~/types/nota'
import type { CategoriaProjeto } from '~/types/projeto'

export type FiltroNota = 'todos' | TipoNota
export type FiltroProjeto = 'todos' | CategoriaProjeto
export type FiltroMeta = 'todos' | 'ativas' | 'vencendo' | 'vencidas' | 'concluidas'
export type FiltroArquivo =
  | 'todos'
  | 'tarefas'
  | 'notas'
  | 'pagamentos'
  | 'projetos'
  | 'metas'
export type FiltroPagamento =
  | 'pendentes'
  | 'todos'
  | 'pendente'
  | 'atrasado'
  | 'pago'

export type View =
  | 'trabalho'
  | 'agenda'
  | 'pagamentos'
  | 'projetos'
  | 'metas'
  | 'notas'
  | 'arquivo'

export const useUIStore = defineStore('ui', () => {
  // === Global ===
  const view = ref<View>('trabalho')
  const busca = ref('')

  // === Agenda ===
  const agenda_3d_offset = ref(0)
  const agenda_full_3d_offset = ref(0)
  const mc_month_offset = ref(0)

  // === Filtros ===
  const filtro_nota = ref<FiltroNota>('todos') // mini-painel em /trabalho
  const filtro_nota_full = ref<FiltroNota>('todos') // página /notas
  const filtro_projeto = ref<FiltroProjeto>('todos')
  const filtro_meta = ref<FiltroMeta>('todos')
  const filtro_arquivo = ref<FiltroArquivo>('todos')
  const filtro_pagamento = ref<FiltroPagamento>('pendentes')

  // === Expansões ===
  const projetos_expandidos = ref<string[]>([])
  const metas_expandidas = ref<string[]>([])
  const notas_expandidas = ref<string[]>([])

  // === Mobile ===
  const mobile_panel = ref<'tarefas' | 'agenda-trab' | 'pag-trab' | 'notas'>(
    'tarefas',
  )

  // === Helpers para expansão ===
  function toggleNotaExpandida(id: string): void {
    const i = notas_expandidas.value.indexOf(id)
    if (i >= 0) notas_expandidas.value.splice(i, 1)
    else notas_expandidas.value.push(id)
  }
  function isNotaExpandida(id: string): boolean {
    return notas_expandidas.value.includes(id)
  }

  function toggleProjetoExpandido(id: string): void {
    const i = projetos_expandidos.value.indexOf(id)
    if (i >= 0) projetos_expandidos.value.splice(i, 1)
    else projetos_expandidos.value.push(id)
  }
  function isProjetoExpandido(id: string): boolean {
    return projetos_expandidos.value.includes(id)
  }

  function toggleMetaExpandida(id: string): void {
    const i = metas_expandidas.value.indexOf(id)
    if (i >= 0) metas_expandidas.value.splice(i, 1)
    else metas_expandidas.value.push(id)
  }
  function isMetaExpandida(id: string): boolean {
    return metas_expandidas.value.includes(id)
  }

  return {
    // global
    view,
    busca,
    // agenda
    agenda_3d_offset,
    agenda_full_3d_offset,
    mc_month_offset,
    // filtros
    filtro_nota,
    filtro_nota_full,
    filtro_projeto,
    filtro_meta,
    filtro_arquivo,
    filtro_pagamento,
    // expansões
    projetos_expandidos,
    metas_expandidas,
    notas_expandidas,
    toggleNotaExpandida,
    isNotaExpandida,
    toggleProjetoExpandido,
    isProjetoExpandido,
    toggleMetaExpandida,
    isMetaExpandida,
    // mobile
    mobile_panel,
  }
})

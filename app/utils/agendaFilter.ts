import type { AgendaItem } from '~~/shared/agendaItem'

/**
 * Pipeline de filtros da agenda — tipo · empresa/projeto · busca · concluídas.
 *
 * Extraído de `app/pages/agenda.vue`, onde era uma função local. As abas
 * Calendário/Timeline de `/trabalho` reusam os mesmos componentes mas tinham um
 * filtro próprio e mais fraco (só empresa), então os mesmos dados apareciam
 * diferentes em cada tela. Agora é uma regra só.
 */

/** `all` = sem filtro. Os demais são tons de tarefa (`AgendaItem.tone`). */
export type AgendaTypeFilter = 'all' | 'ceo' | 'delegate' | 'personal'

export type AgendaFilterOptions = {
  type?: AgendaTypeFilter
  /** `all` = sem filtro. Id da empresa. */
  company?: string
  /** Projetos daquela empresa — o vínculo indireto entre item e empresa. */
  companyProjectIds?: Set<string> | null
  search?: string
  /** `false` esconde o que já está concluído. */
  showDone?: boolean
}

export function filterAgendaItems(
  items: AgendaItem[],
  opts: AgendaFilterOptions = {},
): AgendaItem[] {
  const { type = 'all', company = 'all', companyProjectIds = null, showDone = true } = opts
  const query = opts.search?.trim().toLowerCase() ?? ''

  return items.filter((item) => {
    if (!showDone && item.done) return false

    // Filtrar por tipo de TAREFA (CEO/Delegado/Pessoal) esconde meta e
    // pagamento junto: pedir "CEO" e continuar vendo vencimentos leria como
    // filtro quebrado. Sem filtro, todos os tipos aparecem.
    if (type !== 'all' && item.tone !== type) return false

    if (company !== 'all') {
      const direct = item.companyId === company
      const viaProject = !!item.projectId && !!companyProjectIds?.has(item.projectId)
      if (!direct && !viaProject) return false
    }

    if (query && !item.title.toLowerCase().includes(query)) return false

    return true
  })
}

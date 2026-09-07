// useProgresso — per design-spec-comando.md §10.4
//
// Progressos agregados de checklist / projeto / meta. Stateless — recebe os
// dados pelos parâmetros, então pode ser chamado por qualquer view.

import type { ChecklistItem, Tarefa } from '~/types/tarefa'
import type { Projeto } from '~/types/projeto'
import type { Meta } from '~/types/meta'

export interface ProgressoProjeto {
  feitas: number
  total: number
  pct: number
}

export interface ProgressoMeta {
  feitas: number
  total: number
  totalT: number // tarefas diretas
  totalP: number // projetos vinculados
  tarefasFeitas: number
  projetosFeitos: number
  pct: number
}

export function checklistPct(items: ChecklistItem[]): number {
  if (!items.length) return 0
  const done = items.filter((i) => i.done).length
  return Math.round((done / items.length) * 100)
}

export function progressoProjeto(
  projetoId: string,
  tarefas: Tarefa[],
): ProgressoProjeto {
  const minhas = tarefas.filter(
    (t) => t.projeto_id === projetoId && !t.arquivada,
  )
  const feitas = minhas.filter((t) => t.done).length
  const total = minhas.length
  const pct = total === 0 ? 0 : Math.round((feitas / total) * 100)
  return { feitas, total, pct }
}

export function progressoMeta(
  metaId: string,
  tarefas: Tarefa[],
  projetos: Projeto[],
): ProgressoMeta {
  // Tarefas diretas da meta (sem projeto).
  const diretas = tarefas.filter(
    (t) => t.meta_id === metaId && !t.projeto_id && !t.arquivada,
  )
  const tarefasFeitas = diretas.filter((t) => t.done).length
  const totalT = diretas.length

  // Projetos vinculados à meta.
  const projVinc = projetos.filter(
    (p) => p.meta_id === metaId && !p.arquivado,
  )
  const totalP = projVinc.length
  let projetosFeitos = 0
  for (const p of projVinc) {
    const pp = progressoProjeto(p.id, tarefas)
    if (pp.total > 0 && pp.feitas === pp.total) projetosFeitos++
  }

  const feitas = tarefasFeitas + projetosFeitos
  const total = totalT + totalP
  const pct = total === 0 ? 0 : Math.round((feitas / total) * 100)
  return {
    feitas,
    total,
    totalT,
    totalP,
    tarefasFeitas,
    projetosFeitos,
    pct,
  }
}

export function useProgresso() {
  return { checklistPct, progressoProjeto, progressoMeta }
}

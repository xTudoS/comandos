/**
 * Ordenação de cards dentro de uma coluna de quadro — lógica pura, sem banco.
 *
 * As posições são inteiros densos (0, 1, 2, …): a cada movimento o servidor
 * reescreve as posições da coluna afetada dentro de uma transação e devolve o
 * resultado normalizado. Isso evita a deriva de casas decimais do meio-termo
 * fracionário e a complexidade do LexoRank — as colunas aqui têm dezenas de
 * cards, não milhares, então reescrever a coluna inteira é barato.
 *
 * Convenção de `toIndex`: é o índice FINAL desejado na lista resultante, que é
 * exatamente o que o `newIndex` do Sortable entrega — tanto ao mover dentro da
 * mesma lista quanto ao entrar numa lista nova. É essa convenção que evita o
 * erro de um a mais ao arrastar um card para baixo dentro da própria coluna.
 */

export type CardPosition = { taskId: string; position: number }

/** Índice válido para inserir em uma lista de tamanho `length`. */
function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0
  return Math.min(Math.trunc(index), length)
}

/**
 * Coloca `taskId` na posição `toIndex` da coluna. Se o card já estava na
 * coluna, é removido antes — então `toIndex` sempre se refere à lista final.
 * Inserir em um índice além do fim coloca no fim.
 */
export function placeCard(taskIds: string[], taskId: string, toIndex: number): string[] {
  const without = taskIds.filter((id) => id !== taskId)
  const at = clampIndex(toIndex, without.length)
  return [...without.slice(0, at), taskId, ...without.slice(at)]
}

/** Remove `taskId` da coluna (no-op se não estiver lá). */
export function removeCard(taskIds: string[], taskId: string): string[] {
  return taskIds.filter((id) => id !== taskId)
}

/** Anexa `taskId` ao fim da coluna, sem duplicar se já estiver presente. */
export function appendCard(taskIds: string[], taskId: string): string[] {
  return placeCard(taskIds, taskId, taskIds.length)
}

/** Converte uma ordem de taskIds nas posições densas a gravar. */
export function reindex(taskIds: string[]): CardPosition[] {
  return taskIds.map((taskId, position) => ({ taskId, position }))
}

/**
 * Só as posições que MUDARAM em relação ao estado atual. O `move` reescreve a
 * coluna inteira, mas emitir só o delta evita UPDATEs desnecessários quando o
 * card volta para onde já estava (caso comum no reenvio da fila offline).
 */
export function reindexDelta(
  current: CardPosition[],
  nextOrder: string[],
): CardPosition[] {
  const before = new Map(current.map((c) => [c.taskId, c.position]))
  return reindex(nextOrder).filter((c) => before.get(c.taskId) !== c.position)
}

/**
 * Reordena colunas do quadro a partir da lista de ids enviada pelo cliente.
 * Ids desconhecidos são ignorados e colunas ausentes da lista vão para o fim,
 * na ordem que já tinham — assim um cliente desatualizado (ou o reenvio de uma
 * requisição antiga da fila offline) nunca faz uma coluna sumir da ordenação.
 */
export function reorderColumns(currentIds: string[], requestedIds: string[]): string[] {
  const known = new Set(currentIds)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of requestedIds) {
    if (!known.has(id) || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
  }
  for (const id of currentIds) {
    if (!seen.has(id)) ordered.push(id)
  }
  return ordered
}

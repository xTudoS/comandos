/**
 * Tradução de um evento do Sortable para o destino de um card num quadro.
 *
 * O núcleo é puro (só strings e números) para poder ser testado sem DOM — é
 * aqui que mora o erro clássico de um a mais ao arrastar um card para baixo
 * dentro da própria coluna.
 *
 * Convenção: `toIndex` é o índice FINAL desejado na coluna de destino, que é o
 * que o `newIndex` do Sortable já entrega (ele é lido depois de o Sortable ter
 * movido o nó). A mesma convenção vale no servidor — ver
 * `server/utils/boardOrder.ts`.
 */

export type BoardDrop = {
  taskId: string
  fromColumnId: string
  toColumnId: string
  toIndex: number
}

export type BoardDropInput = {
  taskId?: string | null
  fromColumnId?: string | null
  toColumnId?: string | null
  oldIndex?: number | null
  newIndex?: number | null
}

/**
 * Devolve o destino do card, ou `null` quando não há nada a fazer: evento sem
 * os dados necessários, ou card solto exatamente onde já estava (mesma coluna e
 * mesmo índice) — esse caso é comum quando o usuário desiste no meio do
 * arrasto, e mandá-lo ao servidor só gera escrita inútil.
 */
export function resolveBoardDrop(input: BoardDropInput): BoardDrop | null {
  const { taskId, fromColumnId, toColumnId } = input
  if (!taskId || !fromColumnId || !toColumnId) return null

  const newIndex = input.newIndex
  if (newIndex == null || !Number.isFinite(newIndex) || newIndex < 0) return null

  const sameColumn = fromColumnId === toColumnId
  if (sameColumn && input.oldIndex === newIndex) return null

  return {
    taskId,
    fromColumnId,
    toColumnId,
    toIndex: Math.trunc(newIndex),
  }
}

/** Adaptador de DOM: lê os data-attributes que `QuadroColumn` renderiza. */
export function boardDropFromEvent(evt: {
  item: HTMLElement
  from: HTMLElement
  to: HTMLElement
  oldIndex?: number
  newIndex?: number
}): BoardDrop | null {
  return resolveBoardDrop({
    taskId: evt.item.dataset.id,
    fromColumnId: evt.from.dataset.columnId,
    toColumnId: evt.to.dataset.columnId,
    oldIndex: evt.oldIndex,
    newIndex: evt.newIndex,
  })
}

import type Sortable from 'sortablejs'

/**
 * Desfaz o movimento de DOM que o Sortable acabou de fazer, devolvendo o nó
 * arrastado à lista/posição de origem.
 *
 * As listas de tarefas são renderizadas pelo Vue a partir dos dados: ao soltar
 * um card em outra coluna, quem deve atualizar a tela é a re-renderização do
 * novo horizonte, não o Sortable. Se o nó ficar onde o Sortable o colocou (ou
 * for simplesmente removido), o DOM passa a divergir da árvore de vnodes e as
 * re-ordenações seguintes deixam de mover aquele card.
 */
export function revertSortableMove(evt: Sortable.SortableEvent) {
  const from = evt.from
  const item = evt.item
  if (!from) {
    item.parentNode?.removeChild(item)
    return
  }
  const anchor = from.children[evt.oldIndex ?? from.children.length] ?? null
  from.insertBefore(item, anchor)
}

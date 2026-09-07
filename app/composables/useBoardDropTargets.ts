import Sortable from 'sortablejs'
import { revertSortableMove } from '~/utils/sortableDom'

/**
 * Faz de cada item de quadro da sidebar um alvo de drop para os cards do board
 * de horizontes de /trabalho.
 *
 * Funciona porque a sidebar mora no layout, ou seja, no MESMO documento que o
 * board — então basta entrar no grupo 'horizontes' do Sortable como destino.
 * Não há arrasto entre páginas nem biblioteca nova.
 *
 * `pull: false` impede tirar algo de dentro do item; `draggable: '.board-card'`
 * garante que o ícone e o rótulo do próprio link nunca sejam arrastados.
 */
export function useBoardDropTargets(
  rootEl: Ref<HTMLElement | undefined>,
  boardIds: Ref<string[]>,
  onDrop: (boardId: string, taskId: string) => void,
) {
  const instances: Sortable[] = []

  function destroy() {
    while (instances.length) instances.pop()?.destroy()
  }

  function build() {
    destroy()
    const root = rootEl.value
    if (!root) return
    for (const el of root.querySelectorAll<HTMLElement>('[data-board-id]')) {
      const boardId = el.dataset.boardId
      if (!boardId) continue
      instances.push(
        Sortable.create(el, {
          group: { name: 'horizontes', pull: false, put: true },
          sort: false,
          draggable: '.board-card',
          onAdd(evt) {
            const taskId = (evt.item as HTMLElement).dataset.id
            // O Vue é o dono do DOM do board: devolve o nó à coluna de origem.
            // A tarefa não muda de horizonte ao entrar num quadro — os dois
            // eixos são independentes.
            revertSortableMove(evt)
            if (taskId) onDrop(boardId, taskId)
          },
        }),
      )
    }
  }

  onMounted(build)
  onBeforeUnmount(destroy)
  // A lista de quadros muda (criar, arquivar, broadcast): reconstrói os alvos.
  watch(boardIds, () => nextTick(build))

  return { rebuild: build }
}

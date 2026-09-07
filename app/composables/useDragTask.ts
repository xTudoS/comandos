// useDragTask — per design-spec-comando.md §11.5
//
// Wrapper sobre HTML5 DnD que padroniza source/target. O TarefaCard usa
// useDragSource; o TarefaHorizonte usa useDropTarget.

import { ref } from 'vue'

export function useDragSource(taskId: () => string) {
  const dragging = ref(false)

  function onDragstart(e: DragEvent) {
    if (!e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId())
    dragging.value = true
  }

  function onDragend() {
    dragging.value = false
  }

  return { dragging, onDragstart, onDragend }
}

export function useDropTarget(onDrop: (taskId: string) => void) {
  const isOver = ref(false)

  function onDragover(e: DragEvent) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    isOver.value = true
  }

  function onDragleave() {
    isOver.value = false
  }

  function onDropEvent(e: DragEvent) {
    e.preventDefault()
    isOver.value = false
    const id = e.dataTransfer?.getData('text/plain')
    if (id) onDrop(id)
  }

  return {
    isOver,
    onDragover,
    onDragleave,
    onDrop: onDropEvent,
  }
}

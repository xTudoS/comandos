import type { AgendaItem } from '~~/shared/agendaItem'
import type { Task } from '~/composables/useTasks'

/**
 * Roteia as intenções da agenda (`open`, `move`, `toggleDone`) para o dono de
 * cada tipo. Os componentes de agenda são burros de propósito — se soubessem
 * abrir tarefa, saberiam só isso, que era exatamente o acoplamento que fez
 * `/metas` precisar de calendário e timeline próprios.
 */
export function useAgendaActions() {
  const tasks = useTasks()
  const { openEdit } = useTaskModal()
  const router = useRouter()
  const toast = useToast()

  /**
   * Abre a tarefa mesmo quando ela não está na lista em cache.
   *
   * Antes, `tasks.value.find(...)` que não achasse resultava em clique morto:
   * nada abria e nada era dito. Acontece de verdade — a lista em cache pode
   * estar fria logo após o boot, ou a tarefa pode ter vindo de um quadro
   * compartilhado.
   */
  async function openTask(id: string) {
    const cached = tasks.list.value.find((t) => t.id === id)
    if (cached) {
      openEdit(cached)
      return
    }
    try {
      const fresh = await $fetch<Task>(`/api/tasks/${id}`)
      openEdit(fresh)
    } catch {
      toast.show('Não foi possível abrir a tarefa.')
    }
  }

  /**
   * Meta e pagamento vivem em telas próprias, com modais que ainda não são
   * globais como o de tarefa. O `?abrir=<id>` faz a tela de destino abrir o
   * item direto — clique que navega e já mostra a coisa certa, em vez de
   * largar o usuário numa lista para procurar de novo.
   */
  async function open(item: AgendaItem) {
    switch (item.entityType) {
      case 'task':
        await openTask(item.entityId)
        break
      case 'goal':
        await router.push({ path: '/metas', query: { abrir: item.entityId } })
        break
      case 'payment':
        await router.push({ path: '/pagamentos', query: { abrir: item.entityId } })
        break
      case 'project':
        await router.push({ path: '/projetos', query: { abrir: item.entityId } })
        break
    }
  }

  /**
   * Arrastar para reagendar. Só tarefa tem para onde ir hoje: `scheduledDate`/
   * `scheduledTime` são colunas dela. Meta (prazo) e pagamento (vencimento)
   * ganham isso na Fase 3, com a camada de agendamento — até lá, avisar é
   * melhor do que mover na tela e não persistir.
   */
  async function move(payload: { item: AgendaItem; date: string; time: string }) {
    if (payload.item.entityType !== 'task') {
      toast.show('Por enquanto só tarefas podem ser arrastadas na agenda.')
      return
    }
    try {
      await tasks.update(payload.item.entityId, {
        scheduledDate: payload.date,
        scheduledTime: payload.time,
      })
    } catch {
      toast.show('Não foi possível reagendar.')
    }
  }

  async function toggleDone(item: AgendaItem) {
    if (item.entityType !== 'task') {
      await open(item)
      return
    }
    try {
      await tasks.complete(item.entityId, !item.done)
    } catch {
      toast.show('Não foi possível concluir.')
    }
  }

  return { open, move, toggleDone }
}

import { useMetasStore } from '~/stores/metas'
import { useProjetosStore } from '~/stores/projetos'
import { hasPendingForEntity } from '~/lib/offlineQueue'
import { projectAgenda, type NameLookup } from '~~/shared/agendaProject'
import { sortAgendaItems } from '~~/shared/agendaSort'
import type { AgendaItem, AgendaItemKind } from '~~/shared/agendaItem'
import type { AgendaRange } from '~/composables/useAgendaWindow'

/**
 * Os itens da agenda para uma janela — tarefas, follow-ups, metas e pagamentos.
 *
 * ─── Cache-first, não server-first ───
 * A tela pinta no primeiro frame a partir das listas que o app já mantém em
 * cache (`useOfflineSync.warm()` baixa todas no boot e `plugins/persist.client.ts`
 * as reidrata do IndexedDB). A busca em `/api/agenda` roda em paralelo e só
 * ACRESCENTA o que a derivação local não teria como saber. Nada bloqueia em
 * rede, e offline o comportamento é idêntico ao de hoje.
 *
 * A derivação usa `shared/agendaProject.ts` — o MESMO módulo que o servidor usa
 * para montar a resposta. É o que garante que os dois lados não divirjam de
 * novo, como divergiram quando cada um tinha a sua projeção escrita à mão.
 *
 * ─── Por que o remoto não sobrescreve o local ───
 * O local reflete as edições otimistas (arrastar um card reagenda na hora, sem
 * esperar o servidor). Deixar a resposta da rede substituir a lista faria a
 * edição "voltar" por um instante — e, com a fila offline cheia, a releitura
 * pode vir do cache velho do service worker, então a volta seria permanente.
 * Daí a regra do README: nada é aplicado enquanto houver mutação pendente.
 */

/** Entidades cujas mutações pendentes invalidam a resposta da rede. */
const AGENDA_ENTITIES = ['tasks', 'goals', 'payments'] as const

type WindowKey = string

function windowKey(from: string, to: string, kinds?: AgendaItemKind[]): WindowKey {
  return `${from}|${to}|${kinds?.length ? [...kinds].sort().join(',') : 'all'}`
}

/**
 * Buscas em voo, por janela. Sem isto, a home, o card de agenda e a página
 * disparariam a mesma requisição três vezes no mesmo mount — somadas aos oito
 * refreshes que `useOfflineSync.warm()` já dispara, num Worker que abre um pool
 * de Postgres por requisição.
 */
const inFlight = new Map<WindowKey, Promise<void>>()

export function useAgendaItems(opts: {
  range: Ref<AgendaRange> | ComputedRef<AgendaRange>
  /** Ausente = todos os tipos. */
  kinds?: Ref<AgendaItemKind[] | undefined> | ComputedRef<AgendaItemKind[] | undefined>
  /** Desliga a busca na rede (usado por telas que só leem o cache). */
  localOnly?: boolean
}) {
  const tasks = useTasks()
  const payments = usePayments()
  const companies = useCompanies()
  const metas = useMetasStore()
  const projetos = useProjetosStore()

  const remote = useState<Record<WindowKey, AgendaItem[]>>('agenda:remote', () => ({}))
  const error = useState<string | null>('agenda:remoteError', () => null)

  const projectName = computed<NameLookup>(() => {
    const byId = new Map(projetos.list.map((p) => [p.id, p.nome]))
    return (id) => (id ? (byId.get(id) ?? null) : null)
  })

  const companyName = computed<NameLookup>(() => {
    const byId = new Map(companies.list.value.map((c) => [c.id, c.name]))
    return (id) => (id ? (byId.get(id) ?? null) : null)
  })

  /** Deriva os itens de uma janela arbitrária a partir do cache local. */
  function derive(from: string, to: string, kinds?: AgendaItemKind[]): AgendaItem[] {
    return projectAgenda({
      from,
      to,
      kinds,
      projectName: projectName.value,
      companyName: companyName.value,
      tasks: tasks.list.value
        .filter((t) => !t.archived)
        .map((t) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          done: t.done,
          scheduledDate: t.scheduledDate,
          scheduledTime: t.scheduledTime,
          durationMinutes: t.durationMinutes,
          followupActive: t.followupActive,
          followupDate: t.followupDate,
          projectId: t.projectId,
          companyId: t.companyId,
          delegatePersonId: t.delegatePersonId,
          delegatePersonName: t.delegatePersonName,
        })),
      goals: metas.ativas.map((m) => ({
        id: m.id,
        title: m.titulo,
        dueDate: m.prazo,
        companyId: m.company_id,
        // Mesmo critério do servidor (todas as ações concluídas), só que aqui
        // ele já está calculado pelo store a partir dos agregados.
        done: metas.statusMeta(m) === 'concluida',
      })),
      payments: payments.list.value
        .filter((p) => !p.archived)
        .map((p) => ({
          id: p.id,
          description: p.description,
          amountCents: p.amountCents,
          dueDate: p.dueDate,
          kind: p.kind,
          status: p.status,
          recurrence: p.recurrence,
          companyId: p.companyId,
        })),
    })
  }

  const localItems = computed<AgendaItem[]>(() =>
    derive(opts.range.value.from, opts.range.value.to, opts.kinds?.value),
  )

  /**
   * O que a tela mostra: o local sempre, mais o que só o servidor sabe. Nunca o
   * contrário — o remoto não substitui nem corrige o local.
   */
  const items = computed<AgendaItem[]>(() => {
    const local = localItems.value
    if (AGENDA_ENTITIES.some((entity) => hasPendingForEntity(entity))) return local

    const key = windowKey(opts.range.value.from, opts.range.value.to, opts.kinds?.value)
    const fromServer = remote.value[key]
    if (!fromServer?.length) return local

    const seen = new Set(local.map((i) => i.id))
    const extras = fromServer.filter((i) => !seen.has(i.id))
    return extras.length ? sortAgendaItems([...local, ...extras]) : local
  })

  const loading = computed(() => tasks.loading.value)

  async function fetchWindow(from: string, to: string, kinds?: AgendaItemKind[]) {
    const key = windowKey(from, to, kinds)
    const running = inFlight.get(key)
    if (running) return running

    const promise = (async () => {
      try {
        const res = await $fetch<{ items: AgendaItem[] }>('/api/agenda', {
          query: { from, to, ...(kinds?.length ? { kinds: kinds.join(',') } : {}) },
        })
        remote.value = { ...remote.value, [key]: res.items }
        error.value = null
      } catch {
        // A agenda já está na tela pela derivação local; falhar aqui não é
        // motivo para mostrar erro nem para limpar nada.
        error.value = null
      } finally {
        inFlight.delete(key)
      }
    })()

    inFlight.set(key, promise)
    return promise
  }

  function refresh() {
    if (opts.localOnly) return Promise.resolve()
    return fetchWindow(opts.range.value.from, opts.range.value.to, opts.kinds?.value)
  }

  if (!opts.localOnly && import.meta.client) {
    watch(
      () => windowKey(opts.range.value.from, opts.range.value.to, opts.kinds?.value),
      () => void refresh(),
      { immediate: true },
    )
  }

  return { items, localItems, loading, error, refresh, derive }
}

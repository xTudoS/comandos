import { formatBRL } from '~/utils/money'

export type SearchResultType =
  | 'task'
  | 'project'
  | 'company'
  | 'payment'
  | 'note'
  | 'person'

export interface SearchResult {
  id: string
  type: SearchResultType
  group: string
  title: string
  subtitle?: string
  icon: string
  run: () => void | Promise<void>
}

const GROUP_LABEL: Record<SearchResultType, string> = {
  task: 'Tarefas',
  project: 'Projetos',
  company: 'Empresas',
  payment: 'Pagamentos',
  note: 'Notas',
  person: 'Pessoas',
}

const ICON: Record<SearchResultType, string> = {
  task: 'square-check-big',
  project: 'folder',
  company: 'building-2',
  payment: 'dollar-sign',
  note: 'sticky-note',
  person: 'user',
}

// Busca acento-insensível e case-insensível.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

const PER_GROUP = 6
const TOTAL_LIMIT = 30

export function useGlobalSearch() {
  const router = useRouter()
  const tasks = useTasks()
  const projects = useProjects()
  const companies = useCompanies()
  const payments = usePayments()
  const notes = useNotes()
  const people = usePeople()
  const taskModal = useTaskModal()

  const loaded = useState('global-search:loaded', () => false)

  // Garante que as listas estejam carregadas mesmo que o usuário ainda não
  // tenha visitado as páginas correspondentes. Roda uma única vez.
  async function ensureData(): Promise<void> {
    if (loaded.value) return
    loaded.value = true
    await Promise.allSettled([
      tasks.refresh(),
      projects.refresh(),
      companies.refresh(),
      payments.refresh(),
      notes.refresh(),
      people.refresh(),
    ])
  }

  function search(raw: string): SearchResult[] {
    const q = normalize(raw.trim())
    if (q.length < 1) return []

    const out: SearchResult[] = []
    const take = (type: SearchResultType) =>
      out.filter((r) => r.type === type).length < PER_GROUP

    for (const t of tasks.list.value) {
      if (!take('task')) break
      if (t.archived) continue
      const hay = normalize(`${t.title} ${t.description ?? ''} ${t.delegatePersonName ?? ''}`)
      if (!hay.includes(q)) continue
      out.push({
        id: t.id,
        type: 'task',
        group: GROUP_LABEL.task,
        title: t.title,
        subtitle: t.done ? 'Concluída' : t.delegatePersonName ? `Delegada · ${t.delegatePersonName}` : undefined,
        icon: ICON.task,
        run: async () => {
          await router.push('/trabalho')
          taskModal.openEdit(t)
        },
      })
    }

    for (const p of projects.list.value) {
      if (!take('project')) break
      if (p.archived) continue
      if (!normalize(p.name).includes(q)) continue
      out.push({
        id: p.id,
        type: 'project',
        group: GROUP_LABEL.project,
        title: p.name,
        subtitle: p.openTaskCount ? `${p.openTaskCount} tarefas abertas` : undefined,
        icon: ICON.project,
        run: () => { void router.push('/projetos') },
      })
    }

    for (const c of companies.list.value) {
      if (!take('company')) break
      if (c.archived) continue
      if (!normalize(c.name).includes(q)) continue
      out.push({
        id: c.id,
        type: 'company',
        group: GROUP_LABEL.company,
        title: c.name,
        icon: ICON.company,
        run: () => { void router.push('/empresas') },
      })
    }

    for (const pay of payments.list.value) {
      if (!take('payment')) break
      if (pay.archived) continue
      if (!normalize(`${pay.description} ${pay.notes ?? ''}`).includes(q)) continue
      out.push({
        id: pay.id,
        type: 'payment',
        group: GROUP_LABEL.payment,
        title: pay.description,
        subtitle: `${formatBRL(pay.amountCents)} · ${pay.status === 'paid' ? 'Pago' : 'Pendente'}`,
        icon: ICON.payment,
        run: () => { void router.push('/pagamentos') },
      })
    }

    for (const n of notes.list.value) {
      if (!take('note')) break
      if (n.archived) continue
      if (!normalize(`${n.title} ${n.body ?? ''}`).includes(q)) continue
      out.push({
        id: n.id,
        type: 'note',
        group: GROUP_LABEL.note,
        title: n.title,
        icon: ICON.note,
        run: () => { void router.push('/notas') },
      })
    }

    for (const person of people.list.value) {
      if (!take('person')) break
      if (person.archived) continue
      if (!normalize(`${person.name} ${person.email ?? ''}`).includes(q)) continue
      out.push({
        id: person.id,
        type: 'person',
        group: GROUP_LABEL.person,
        title: person.name,
        subtitle: person.email ?? undefined,
        icon: ICON.person,
        run: () => { void router.push('/settings/people') },
      })
    }

    return out.slice(0, TOTAL_LIMIT)
  }

  return { search, ensureData }
}

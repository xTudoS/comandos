export type NoteType = 'playbook' | 'credential' | 'contact' | 'decision' | 'reference'
export type NoteStatus = 'active' | 'draft'

export type Note = {
  id: string
  ownerUserId: string
  title: string
  body: string
  type: NoteType
  projectId: string | null
  companyId: string | null
  status: NoteStatus
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type CreateNoteInput = {
  title: string
  body?: string
  type?: NoteType
  projectId?: string | null
  companyId?: string | null
  status?: NoteStatus
}

export type UpdateNotePatch = Partial<
  Pick<Note, 'title' | 'body' | 'type' | 'projectId' | 'companyId' | 'status'>
>

export function useNotes() {
  const list = useState<Note[]>('notes:list', () => [])
  const loading = useState('notes:loading', () => false)
  const error = useState<string | null>('notes:error', () => null)

  async function refresh(opts: { includeArchived?: boolean; type?: NoteType; projectId?: string } = {}) {
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (opts.includeArchived) query.includeArchived = '1'
      if (opts.type) query.type = opts.type
      if (opts.projectId) query.projectId = opts.projectId
      const res = await $fetch<{ notes: Note[] }>('/api/notes', { query })
      list.value = res.notes
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao carregar notas.'
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateNoteInput) {
    await $fetch('/api/notes', { method: 'POST', body: input })
    await refresh()
  }

  async function update(id: string, patch: UpdateNotePatch) {
    await $fetch(`/api/notes/${id}`, { method: 'PATCH', body: patch })
    await refresh()
  }

  async function archive(id: string, archived = true) {
    await $fetch(`/api/notes/${id}/archive`, {
      method: 'POST',
      body: { archived },
    })
    await refresh()
  }

  async function remove(id: string) {
    await $fetch(`/api/notes/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return { list, loading, error, refresh, create, update, archive, remove }
}

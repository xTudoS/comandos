// Shared export/import logic so the topbar buttons and the /settings/backup
// page hit the same endpoints with consistent UX.

export function useBackup() {
  const exporting = ref(false)
  const importing = ref(false)
  const error = ref<string | null>(null)

  async function exportAll() {
    exporting.value = true
    error.value = null
    try {
      const payload = await $fetch<unknown>('/api/backup/export')
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comando-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao exportar.'
      throw e
    } finally {
      exporting.value = false
    }
  }

  async function importFromFile(
    file: File,
  ): Promise<{ imported: Record<string, number> } | null> {
    let payload: unknown
    try {
      const text = await file.text()
      payload = JSON.parse(text)
    } catch {
      error.value = 'Arquivo não é um JSON válido.'
      return null
    }

    importing.value = true
    error.value = null
    try {
      const res = await $fetch<{ ok: boolean; imported: Record<string, number> }>(
        '/api/backup/import',
        { method: 'POST', body: payload },
      )
      return { imported: res.imported }
    } catch (e) {
      error.value = (e as { message?: string })?.message ?? 'Falha ao importar.'
      return null
    } finally {
      importing.value = false
    }
  }

  return { exporting, importing, error, exportAll, importFromFile }
}

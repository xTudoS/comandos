type CurrentUser = {
  id: string
  email: string
  name: string
  role: 'owner' | 'delegate'
}

// Reactive self-info shared across the shell (topbar, etc). Fetched lazily
// on first mount so protected pages don't block SSR; the cached value
// survives client-side nav via useState.
export function useCurrentUser() {
  const user = useState<CurrentUser | null>('auth:me', () => null)
  const loading = useState('auth:me:loading', () => false)

  async function refresh() {
    loading.value = true
    try {
      user.value = await $fetch<CurrentUser>('/api/auth/me')
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  return { user, loading, refresh }
}

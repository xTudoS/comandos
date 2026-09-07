// Named middleware — pages opt in via definePageMeta({ middleware: 'admin' }).
// The global auth middleware already enforces login; this one only gates on
// role. Delegates get bumped to /trabalho so the route doesn't flash an
// unauthorized admin shell.
export default defineNuxtRouteMiddleware(async () => {
  const { user, refresh } = useCurrentUser()
  if (!user.value) await refresh()
  if (!user.value) return navigateTo('/login')
  if (user.value.role !== 'owner') return navigateTo('/trabalho')
})

// Tracks whether the primary scroll container (layout `.main`) has scrolled
// past a small threshold. Used to toggle the translucent topbar into a more
// opaque state once content slides under it — Apple pattern.

export function useMainScrolled(threshold = 8) {
  const scrolled = ref(false)

  if (typeof window === 'undefined') return scrolled

  let mainEl: HTMLElement | null = null
  let raf = 0

  function update() {
    if (!mainEl) return
    const next = mainEl.scrollTop > threshold
    if (next !== scrolled.value) scrolled.value = next
  }

  function onScroll() {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(update)
  }

  onMounted(() => {
    mainEl = document.querySelector<HTMLElement>('.view-wrap')
    if (!mainEl) return
    mainEl.addEventListener('scroll', onScroll, { passive: true })
    update()
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    mainEl?.removeEventListener('scroll', onScroll)
  })

  return scrolled
}

// uid — id curto para itens locais (anotação, checklist) antes de virem do server.

export function uid(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 9)
  const t = Date.now().toString(36)
  return `${prefix}_${t}${rand}`
}

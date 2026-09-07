// UI-side horizon definitions. Backend enum uses `hibernating` (en); the
// prototype UI used `hibernando` (pt-BR). We store the UI label in the
// prototype style and translate to/from DB via the maps below.

// O board agrupa os horizontes em duas seções visuais: FOCO (próximo) e
// BACKLOG (depois). Micro não é mais horizonte — virou uma flag (is_micro).
export type HorizonSection = 'foco' | 'backlog'

export const HORIZONTES = [
  { id: 'core7', label: '7 dias', desc: 'Próximos 7 dias', section: 'foco' },
  { id: 'core30', label: '30 dias', desc: 'Próximas 4 semanas', section: 'foco' },
  { id: 'core60', label: '60 dias', desc: '2 meses', section: 'backlog' },
  { id: 'core90', label: '90 dias', desc: '3 meses', section: 'backlog' },
  { id: 'hibernando', label: 'Hibernando', desc: 'Sem operador', section: 'backlog' },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  desc: string
  section: HorizonSection
}>

export type HorizonUI = (typeof HORIZONTES)[number]['id']
export type HorizonDb = 'core7' | 'core30' | 'core60' | 'core90' | 'hibernating'

export const horizonUIToDb: Record<HorizonUI, HorizonDb> = {
  core7: 'core7',
  core30: 'core30',
  core60: 'core60',
  core90: 'core90',
  hibernando: 'hibernating',
}

export const horizonDbToUI: Record<HorizonDb, HorizonUI> = {
  core7: 'core7',
  core30: 'core30',
  core60: 'core60',
  core90: 'core90',
  hibernating: 'hibernando',
}

export function horizonLabel(id: HorizonUI | HorizonDb): string {
  const uiId = (id in horizonDbToUI
    ? horizonDbToUI[id as HorizonDb]
    : (id as HorizonUI))
  return HORIZONTES.find((h) => h.id === uiId)?.label ?? uiId
}

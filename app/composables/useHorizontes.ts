// useHorizontes — per design-spec-comando.md §7.3
//
// Versão da spec inclui `color` (token CSS) além de id/label/desc.
// `utils/horizontes.ts` já exporta um HORIZONTES sem cor (auto-importado pelo
// Nuxt). Para evitar colisão, expomos o array via composable apenas — o
// nome do array interno é HORIZONTES_DEF (não-colidente).

import type { Horizonte } from '~/types/tarefa'

const HORIZONTES_DEF = [
  {
    id: 'core7',
    label: '7 dias',
    desc: 'Próximos 7 dias',
    color: 'var(--color-h-core7)',
  },
  {
    id: 'core30',
    label: '30 dias',
    desc: 'Próximas 4 semanas',
    color: 'var(--color-h-core30)',
  },
  {
    id: 'core60',
    label: '60 dias',
    desc: '2 meses',
    color: 'var(--color-h-core60)',
  },
  {
    id: 'core90',
    label: '90 dias',
    desc: '3 meses',
    color: 'var(--color-h-core90)',
  },
  {
    id: 'hibernando',
    label: 'Hibernando',
    desc: 'Sem operador',
    color: 'var(--color-h-hibernando)',
  },
] as const satisfies ReadonlyArray<{
  id: Horizonte
  label: string
  desc: string
  color: string
}>

export type HorizonteDef = (typeof HORIZONTES_DEF)[number]

const BY_ID: Record<Horizonte, HorizonteDef> = HORIZONTES_DEF.reduce(
  (acc, h) => {
    acc[h.id] = h
    return acc
  },
  {} as Record<Horizonte, HorizonteDef>,
)

export function horizonteById(id: Horizonte): HorizonteDef {
  return BY_ID[id]
}

export function useHorizontes() {
  return {
    HORIZONTES: HORIZONTES_DEF,
    horizonteById,
  }
}

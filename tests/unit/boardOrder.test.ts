import { describe, it, expect } from 'vitest'
import {
  appendCard,
  placeCard,
  reindex,
  reindexDelta,
  removeCard,
  reorderColumns,
} from '~~/shared/boardOrder'

describe('placeCard', () => {
  it('insere no início, no meio e no fim de uma coluna nova', () => {
    expect(placeCard(['b', 'c'], 'a', 0)).toEqual(['a', 'b', 'c'])
    expect(placeCard(['b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(placeCard(['b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })

  it('move para baixo dentro da mesma coluna sem errar por um', () => {
    // O card sai da posição 0 e o índice pedido já é o índice FINAL, então o
    // resultado tem que ser [b, c, a, d] — não [b, c, d, a].
    expect(placeCard(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('move para cima dentro da mesma coluna', () => {
    expect(placeCard(['a', 'b', 'c', 'd'], 'c', 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('mover para o índice que já ocupa não muda nada', () => {
    expect(placeCard(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c'])
  })

  it('índice além do fim coloca no fim, e índice negativo no início', () => {
    expect(placeCard(['a', 'b'], 'c', 99)).toEqual(['a', 'b', 'c'])
    expect(placeCard(['a', 'b'], 'c', -5)).toEqual(['c', 'a', 'b'])
  })

  it('nunca duplica um card que já está na coluna', () => {
    expect(placeCard(['a', 'b'], 'a', 1)).toEqual(['b', 'a'])
  })
})

describe('removeCard / appendCard', () => {
  it('remove o card e é no-op quando ele não está lá', () => {
    expect(removeCard(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
    expect(removeCard(['a', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('anexa no fim sem duplicar', () => {
    expect(appendCard(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(appendCard(['a', 'b'], 'a')).toEqual(['b', 'a'])
  })
})

describe('reindex', () => {
  it('gera posições densas a partir da ordem', () => {
    expect(reindex(['a', 'b', 'c'])).toEqual([
      { taskId: 'a', position: 0 },
      { taskId: 'b', position: 1 },
      { taskId: 'c', position: 2 },
    ])
  })
})

describe('reindexDelta', () => {
  const current = [
    { taskId: 'a', position: 0 },
    { taskId: 'b', position: 1 },
    { taskId: 'c', position: 2 },
  ]

  it('devolve só o que mudou', () => {
    expect(reindexDelta(current, ['b', 'a', 'c'])).toEqual([
      { taskId: 'b', position: 0 },
      { taskId: 'a', position: 1 },
    ])
  })

  it('devolve vazio quando a ordem é a mesma — o reenvio da fila vira no-op', () => {
    expect(reindexDelta(current, ['a', 'b', 'c'])).toEqual([])
  })

  it('trata card novo na coluna como mudança', () => {
    expect(reindexDelta(current, ['a', 'b', 'c', 'd'])).toEqual([
      { taskId: 'd', position: 3 },
    ])
  })
})

describe('reorderColumns', () => {
  it('aplica a ordem pedida', () => {
    expect(reorderColumns(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })

  it('ignora ids desconhecidos', () => {
    expect(reorderColumns(['a', 'b'], ['b', 'zzz', 'a'])).toEqual(['b', 'a'])
  })

  it('ignora ids repetidos no pedido', () => {
    expect(reorderColumns(['a', 'b'], ['b', 'b', 'a'])).toEqual(['b', 'a'])
  })

  it('coluna ausente do pedido vai pro fim, mantendo a ordem atual', () => {
    // Cliente desatualizado (ou reenvio de uma requisição antiga da fila) não
    // pode fazer uma coluna sumir da ordenação.
    expect(reorderColumns(['a', 'b', 'c'], ['c'])).toEqual(['c', 'a', 'b'])
  })
})

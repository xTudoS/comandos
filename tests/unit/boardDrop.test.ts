import { describe, it, expect } from 'vitest'
import { resolveBoardDrop } from '~/utils/boardDrop'

describe('resolveBoardDrop', () => {
  it('resolve movimento entre colunas', () => {
    expect(
      resolveBoardDrop({
        taskId: 't1',
        fromColumnId: 'c1',
        toColumnId: 'c2',
        oldIndex: 0,
        newIndex: 2,
      }),
    ).toEqual({ taskId: 't1', fromColumnId: 'c1', toColumnId: 'c2', toIndex: 2 })
  })

  it('resolve reordenação dentro da mesma coluna usando o índice final', () => {
    // newIndex do Sortable já é o índice final; repassar direto é o que evita o
    // erro de um a mais ao arrastar para baixo.
    expect(
      resolveBoardDrop({
        taskId: 't1',
        fromColumnId: 'c1',
        toColumnId: 'c1',
        oldIndex: 0,
        newIndex: 3,
      }),
    ).toEqual({ taskId: 't1', fromColumnId: 'c1', toColumnId: 'c1', toIndex: 3 })
  })

  it('ignora card solto onde já estava', () => {
    expect(
      resolveBoardDrop({
        taskId: 't1',
        fromColumnId: 'c1',
        toColumnId: 'c1',
        oldIndex: 2,
        newIndex: 2,
      }),
    ).toBeNull()
  })

  it('mesma posição em coluna diferente ainda é um movimento', () => {
    expect(
      resolveBoardDrop({
        taskId: 't1',
        fromColumnId: 'c1',
        toColumnId: 'c2',
        oldIndex: 2,
        newIndex: 2,
      }),
    ).not.toBeNull()
  })

  it('devolve null quando faltam dados do evento', () => {
    const base = { taskId: 't1', fromColumnId: 'c1', toColumnId: 'c2', newIndex: 1 }
    expect(resolveBoardDrop({ ...base, taskId: undefined })).toBeNull()
    expect(resolveBoardDrop({ ...base, fromColumnId: null })).toBeNull()
    expect(resolveBoardDrop({ ...base, toColumnId: undefined })).toBeNull()
    expect(resolveBoardDrop({ ...base, newIndex: undefined })).toBeNull()
  })

  it('trunca índice fracionário e rejeita negativo', () => {
    expect(
      resolveBoardDrop({
        taskId: 't1',
        fromColumnId: 'c1',
        toColumnId: 'c2',
        newIndex: 2.9,
      })?.toIndex,
    ).toBe(2)
    expect(
      resolveBoardDrop({
        taskId: 't1',
        fromColumnId: 'c1',
        toColumnId: 'c2',
        newIndex: -1,
      }),
    ).toBeNull()
  })
})

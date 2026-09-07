import { describe, it, expect } from 'vitest'
import {
  agendaSortKey,
  compareAgendaItems,
  groupAgendaItemsByDay,
  sortAgendaItems,
} from '~~/shared/agendaSort'
import {
  normalizeTime,
  occurrenceId,
  parseOccurrenceId,
  type AgendaItem,
} from '~~/shared/agendaItem'

function item(partial: Partial<AgendaItem> & Pick<AgendaItem, 'id' | 'date'>): AgendaItem {
  const time = partial.time ?? null
  return {
    kind: 'task',
    entityType: 'task',
    entityId: partial.id,
    entryId: null,
    time,
    endDate: partial.date,
    endTime: null,
    shape: time ? 'block' : 'milestone',
    allDay: time === null,
    recurring: false,
    title: partial.id,
    done: false,
    tone: 'ceo',
    subtitle: null,
    projectId: null,
    companyId: null,
    delegatePersonId: null,
    delegatePersonName: null,
    amountCents: null,
    ...partial,
  }
}

const ids = (items: AgendaItem[]) => items.map((i) => i.id)

describe('sortAgendaItems', () => {
  it('ordena por dia antes de qualquer outra coisa', () => {
    const out = sortAgendaItems([
      item({ id: 'c', date: '2026-09-09', time: '08:00' }),
      item({ id: 'a', date: '2026-09-07', time: '18:00' }),
      item({ id: 'b', date: '2026-09-08' }),
    ])
    expect(ids(out)).toEqual(['a', 'b', 'c'])
  })

  it('põe item de dia todo ANTES dos que têm hora', () => {
    // Esta é a regra que unifica as três divergentes: dia todo vai para o
    // início do dia, porque é exatamente onde a faixa "dia todo" desenha.
    const out = sortAgendaItems([
      item({ id: 'com-hora', date: '2026-09-07', time: '09:00' }),
      item({ id: 'dia-todo', date: '2026-09-07' }),
    ])
    expect(ids(out)).toEqual(['dia-todo', 'com-hora'])
  })

  it('ordena cronologicamente dentro do dia', () => {
    const out = sortAgendaItems([
      item({ id: 'tarde', date: '2026-09-07', time: '14:30' }),
      item({ id: 'noite', date: '2026-09-07', time: '21:00' }),
      item({ id: 'manha', date: '2026-09-07', time: '09:15' }),
    ])
    expect(ids(out)).toEqual(['manha', 'tarde', 'noite'])
  })

  it('põe a faixa multi-dia antes do que acontece dentro do dia', () => {
    const out = sortAgendaItems([
      item({ id: 'marco', date: '2026-09-07', shape: 'milestone' }),
      item({ id: 'faixa', date: '2026-09-07', endDate: '2026-09-18', shape: 'span' }),
    ])
    expect(ids(out)).toEqual(['faixa', 'marco'])
  })

  it('desempata por id para a ordem não oscilar entre renders', () => {
    const a = item({ id: 'aaa', date: '2026-09-07', time: '09:00' })
    const b = item({ id: 'bbb', date: '2026-09-07', time: '09:00' })
    expect(ids(sortAgendaItems([b, a]))).toEqual(['aaa', 'bbb'])
    expect(ids(sortAgendaItems([a, b]))).toEqual(['aaa', 'bbb'])
  })

  it('não muta a lista recebida', () => {
    const input = [
      item({ id: 'b', date: '2026-09-09' }),
      item({ id: 'a', date: '2026-09-07' }),
    ]
    sortAgendaItems(input)
    expect(ids(input)).toEqual(['b', 'a'])
  })

  it('ordena tipos diferentes juntos, sem privilegiar tarefa', () => {
    const out = sortAgendaItems([
      item({ id: 'tarefa', date: '2026-09-07', time: '10:00', kind: 'task' }),
      item({ id: 'pagamento', date: '2026-09-07', kind: 'payment', entityType: 'payment' }),
      item({ id: 'meta', date: '2026-09-07', kind: 'goal', entityType: 'goal' }),
    ])
    // Meta e pagamento são marcos de dia todo, então sobem; entre si, o id
    // desempata. A tarefa com hora fica por último.
    expect(ids(out)).toEqual(['meta', 'pagamento', 'tarefa'])
  })
})

describe('compareAgendaItems', () => {
  it('devolve 0 para o mesmo item', () => {
    const a = item({ id: 'a', date: '2026-09-07', time: '09:00' })
    expect(compareAgendaItems(a, a)).toBe(0)
  })

  it('é consistente com a chave de ordenação', () => {
    const a = item({ id: 'a', date: '2026-09-07' })
    const b = item({ id: 'b', date: '2026-09-07', time: '09:00' })
    expect(agendaSortKey(a) < agendaSortKey(b)).toBe(true)
    expect(compareAgendaItems(a, b)).toBe(-1)
    expect(compareAgendaItems(b, a)).toBe(1)
  })
})

describe('groupAgendaItemsByDay', () => {
  it('agrupa em dias crescentes, com cada dia já ordenado', () => {
    const grouped = groupAgendaItemsByDay([
      item({ id: 'd2-hora', date: '2026-09-08', time: '11:00' }),
      item({ id: 'd1-hora', date: '2026-09-07', time: '15:00' }),
      item({ id: 'd1-todo', date: '2026-09-07' }),
    ])
    expect([...grouped.keys()]).toEqual(['2026-09-07', '2026-09-08'])
    expect(ids(grouped.get('2026-09-07')!)).toEqual(['d1-todo', 'd1-hora'])
    expect(ids(grouped.get('2026-09-08')!)).toEqual(['d2-hora'])
  })

  it('devolve mapa vazio para lista vazia', () => {
    expect(groupAgendaItemsByDay([]).size).toBe(0)
  })
})

describe('normalizeTime', () => {
  it('corta os segundos que o Postgres devolve', () => {
    // Sem isto, timeline/mês/atrasados renderizam "10:00:00" na tela.
    expect(normalizeTime('10:00:00')).toBe('10:00')
    expect(normalizeTime('09:30')).toBe('09:30')
  })

  it('trata ausência como dia todo', () => {
    expect(normalizeTime(null)).toBeNull()
    expect(normalizeTime(undefined)).toBeNull()
    expect(normalizeTime('')).toBeNull()
    expect(normalizeTime('  ')).toBeNull()
  })
})

describe('occurrenceId', () => {
  it('faz round-trip', () => {
    const entryId = '0f7c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'
    const id = occurrenceId(entryId, '2026-09-07')
    expect(id).toBe(`${entryId}:2026-09-07`)
    expect(parseOccurrenceId(id)).toEqual({ entryId, date: '2026-09-07' })
  })

  it('devolve null para id que não é de ocorrência', () => {
    expect(parseOccurrenceId('0f7c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f')).toBeNull()
    expect(parseOccurrenceId('algo:nao-e-data')).toBeNull()
    expect(parseOccurrenceId(':2026-09-07')).toBeNull()
  })
})

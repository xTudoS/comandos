import { describe, it, expect } from 'vitest'
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  expandRRule,
  firstOccurrenceOnOrAfter,
  formatRRule,
  parseRRule,
  recurrenceToRRule,
  startOfWeekMonday,
  type RRule,
} from '~~/shared/rrule'

/** Atalho: só as regras válidas chegam aqui, então o `!` é seguro no teste. */
function rule(input: string): RRule {
  const parsed = parseRRule(input)
  expect(parsed, `esperava que "${input}" fosse válida`).not.toBeNull()
  return parsed!
}

describe('aritmética de calendário', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('conta dias entre datas, com sinal', () => {
    expect(daysBetween('2026-09-07', '2026-09-14')).toBe(7)
    expect(daysBetween('2026-09-14', '2026-09-07')).toBe(-7)
    expect(daysBetween('2026-09-07', '2026-09-07')).toBe(0)
  })

  it('não escorrega no horário de verão (a aritmética é UTC)', () => {
    // Datas em torno de trocas históricas de fuso no Brasil. Com aritmética em
    // hora local, somar 1 dia aqui pode devolver o mesmo dia ou pular dois.
    expect(addDays('2018-11-03', 1)).toBe('2018-11-04')
    expect(addDays('2019-02-16', 1)).toBe('2019-02-17')
    expect(daysBetween('2018-10-01', '2018-12-01')).toBe(61)
  })

  it('acha a segunda-feira da semana', () => {
    expect(startOfWeekMonday('2026-09-07')).toBe('2026-09-07') // já é segunda
    expect(startOfWeekMonday('2026-09-09')).toBe('2026-09-07') // quarta
    expect(startOfWeekMonday('2026-09-13')).toBe('2026-09-07') // domingo
  })
})

describe('addMonthsClamped', () => {
  it('preserva o dia do mês', () => {
    expect(addMonthsClamped('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsClamped('2026-01-15', 3)).toBe('2026-04-15')
  })

  it('clampa para o último dia válido do mês de destino', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30')
    expect(addMonthsClamped('2026-08-31', 1)).toBe('2026-09-30')
  })

  it('respeita ano bissexto', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28')
  })

  it('não acumula deriva: o clamp sempre parte da âncora', () => {
    // 31/01 → fev clampa para 28, mas março volta para 31 porque a conta é
    // feita a partir de 31/01, não a partir do resultado anterior.
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('atravessa o ano', () => {
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonthsClamped('2026-06-15', 12)).toBe('2027-06-15')
  })
})

describe('parseRRule', () => {
  it('aceita o mínimo', () => {
    expect(parseRRule('FREQ=DAILY')).toEqual({
      freq: 'DAILY',
      interval: 1,
      byDay: null,
      count: null,
      until: null,
    })
  })

  it('aceita o prefixo RRULE: e é case-insensitive', () => {
    expect(parseRRule('RRULE:freq=weekly;interval=2')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byDay: null,
      count: null,
      until: null,
    })
  })

  it('normaliza BYDAY para a ordem canônica a partir de segunda', () => {
    expect(rule('FREQ=WEEKLY;BYDAY=SU,WE,MO').byDay).toEqual(['MO', 'WE', 'SU'])
  })

  it('aceita UNTIL no formato do RFC e no formato do app', () => {
    expect(rule('FREQ=DAILY;UNTIL=20261231').until).toBe('2026-12-31')
    expect(rule('FREQ=DAILY;UNTIL=20261231T235959Z').until).toBe('2026-12-31')
    expect(rule('FREQ=DAILY;UNTIL=2026-12-31').until).toBe('2026-12-31')
  })

  it('rejeita o que não é suportado, em vez de ignorar em silêncio', () => {
    // Uma BYMONTHDAY descartada viraria uma série que o usuário acha que
    // configurou e que nunca acontece.
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toBeNull()
    expect(parseRRule('FREQ=SECONDLY')).toBeNull()
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO')).toBeNull() // BYDAY só em WEEKLY
    expect(parseRRule('FREQ=DAILY;COUNT=3;UNTIL=20261231')).toBeNull() // exclusivos
    expect(parseRRule('FREQ=DAILY;INTERVAL=0')).toBeNull()
    expect(parseRRule('FREQ=DAILY;INTERVAL=-1')).toBeNull()
    expect(parseRRule('FREQ=DAILY;COUNT=0')).toBeNull()
    expect(parseRRule('FREQ=DAILY;FREQ=WEEKLY')).toBeNull() // chave repetida
    expect(parseRRule('FREQ=WEEKLY;BYDAY=XX')).toBeNull()
    expect(parseRRule('FREQ=WEEKLY;BYDAY=')).toBeNull()
    expect(parseRRule('FREQ=DAILY;UNTIL=20260231')).toBeNull() // 31 de fevereiro
    expect(parseRRule('INTERVAL=2')).toBeNull() // sem FREQ
    expect(parseRRule('')).toBeNull()
    expect(parseRRule('lixo')).toBeNull()
  })
})

describe('formatRRule', () => {
  it('faz round-trip das regras suportadas', () => {
    for (const input of [
      'FREQ=DAILY',
      'FREQ=MONTHLY;INTERVAL=3',
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=10',
      'FREQ=YEARLY;UNTIL=20301231',
    ]) {
      expect(formatRRule(rule(input))).toBe(input)
    }
  })

  it('omite INTERVAL=1, que é o padrão', () => {
    expect(formatRRule(rule('FREQ=DAILY;INTERVAL=1'))).toBe('FREQ=DAILY')
  })
})

describe('recurrenceToRRule', () => {
  it('cobre todo o enum payment_recurrence', () => {
    expect(recurrenceToRRule('none')).toBeNull()
    expect(recurrenceToRRule('weekly')).toBe('FREQ=WEEKLY')
    expect(recurrenceToRRule('monthly')).toBe('FREQ=MONTHLY')
    expect(recurrenceToRRule('quarterly')).toBe('FREQ=MONTHLY;INTERVAL=3')
    expect(recurrenceToRRule('yearly')).toBe('FREQ=YEARLY')
  })

  it('preserva o comportamento do nextDueDate que substitui', () => {
    // paymentsService.nextDueDate somava 3 meses com clamp para 'quarterly'.
    const quarterly = rule(recurrenceToRRule('quarterly')!)
    expect(expandRRule(quarterly, '2026-01-31', { from: '2026-01-31', to: '2026-12-31' })).toEqual([
      '2026-01-31',
      '2026-04-30',
      '2026-07-31',
      '2026-10-31',
    ])
  })
})

describe('expandRRule — diária', () => {
  it('respeita o intervalo', () => {
    expect(
      expandRRule(rule('FREQ=DAILY;INTERVAL=3'), '2026-09-07', {
        from: '2026-09-07',
        to: '2026-09-20',
      }),
    ).toEqual(['2026-09-07', '2026-09-10', '2026-09-13', '2026-09-16', '2026-09-19'])
  })

  it('recorta pela janela sem desalinhar a série', () => {
    // A série continua ancorada em 07/09: a janela filtra, não reancora.
    expect(
      expandRRule(rule('FREQ=DAILY;INTERVAL=3'), '2026-09-07', {
        from: '2026-09-11',
        to: '2026-09-17',
      }),
    ).toEqual(['2026-09-13', '2026-09-16'])
  })

  it('não devolve nada quando a janela é anterior à série', () => {
    expect(
      expandRRule(rule('FREQ=DAILY'), '2026-09-07', { from: '2026-08-01', to: '2026-08-31' }),
    ).toEqual([])
  })

  it('avança direto até a janela numa série antiga sem COUNT nem UNTIL', () => {
    // Sem o atalho, isto percorreria ~11 anos de datas descartadas.
    expect(
      expandRRule(rule('FREQ=DAILY'), '2015-01-01', { from: '2026-09-07', to: '2026-09-09' }),
    ).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
  })
})

describe('expandRRule — semanal', () => {
  it('sem BYDAY, repete o dia da semana da âncora', () => {
    expect(
      expandRRule(rule('FREQ=WEEKLY'), '2026-09-09', { from: '2026-09-01', to: '2026-09-30' }),
    ).toEqual(['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30'])
  })

  it('com BYDAY, emite cada dia listado na ordem do calendário', () => {
    expect(
      expandRRule(rule('FREQ=WEEKLY;BYDAY=MO,WE'), '2026-09-07', {
        from: '2026-09-07',
        to: '2026-09-20',
      }),
    ).toEqual(['2026-09-07', '2026-09-09', '2026-09-14', '2026-09-16'])
  })

  it('com INTERVAL, pula semanas inteiras', () => {
    expect(
      expandRRule(rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'), '2026-09-07', {
        from: '2026-09-07',
        to: '2026-09-30',
      }),
    ).toEqual(['2026-09-07', '2026-09-09', '2026-09-21', '2026-09-23'])
  })

  it('não emite dia anterior à âncora dentro da própria semana', () => {
    // Âncora numa quarta, BYDAY inclui segunda: a segunda daquela semana já
    // passou e não é ocorrência.
    expect(
      expandRRule(rule('FREQ=WEEKLY;BYDAY=MO,WE'), '2026-09-09', {
        from: '2026-09-01',
        to: '2026-09-20',
      }),
    ).toEqual(['2026-09-09', '2026-09-14', '2026-09-16'])
  })
})

describe('expandRRule — mensal e anual', () => {
  it('mensal preserva o dia e clampa fevereiro', () => {
    expect(
      expandRRule(rule('FREQ=MONTHLY'), '2026-01-31', { from: '2026-01-01', to: '2026-05-31' }),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('mensal com janela no meio da série acerta o alinhamento', () => {
    // O clamp pode empurrar a data para trás dentro do mês, então a estimativa
    // de "quantos meses pular" precisa recuar um passo antes de varrer.
    expect(
      expandRRule(rule('FREQ=MONTHLY'), '2026-01-31', { from: '2026-03-01', to: '2026-04-30' }),
    ).toEqual(['2026-03-31', '2026-04-30'])
  })

  it('anual atravessa o bissexto', () => {
    expect(
      expandRRule(rule('FREQ=YEARLY'), '2028-02-29', { from: '2028-01-01', to: '2031-12-31' }),
    ).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28'])
  })
})

describe('expandRRule — limites da série', () => {
  it('COUNT conta desde a primeira ocorrência, mesmo fora da janela', () => {
    // 5 ocorrências no total (07, 08, 09, 10, 11); a janela vê só as 3 últimas.
    expect(
      expandRRule(rule('FREQ=DAILY;COUNT=5'), '2026-09-07', {
        from: '2026-09-09',
        to: '2026-09-30',
      }),
    ).toEqual(['2026-09-09', '2026-09-10', '2026-09-11'])
  })

  it('UNTIL é inclusivo', () => {
    expect(
      expandRRule(rule('FREQ=DAILY;UNTIL=20260909'), '2026-09-07', {
        from: '2026-09-01',
        to: '2026-09-30',
      }),
    ).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
  })

  it('trunca no teto de segurança', () => {
    const out = expandRRule(rule('FREQ=DAILY'), '2026-01-01', {
      from: '2026-01-01',
      to: '2030-01-01',
      max: 10,
    })
    expect(out).toHaveLength(10)
    expect(out[0]).toBe('2026-01-01')
  })

  it('devolve lista vazia em entrada inválida ou janela invertida', () => {
    const daily = rule('FREQ=DAILY')
    expect(expandRRule(daily, 'ontem', { from: '2026-09-01', to: '2026-09-30' })).toEqual([])
    expect(expandRRule(daily, '2026-09-07', { from: '2026-09-30', to: '2026-09-01' })).toEqual([])
    expect(expandRRule(daily, '2026-09-07', { from: '2026-09-01', to: '2026-09-30', max: 0 })).toEqual([])
  })
})

describe('firstOccurrenceOnOrAfter', () => {
  it('acha o próximo vencimento de uma série mensal', () => {
    expect(firstOccurrenceOnOrAfter(rule('FREQ=MONTHLY'), '2026-01-31', '2026-03-15')).toBe(
      '2026-03-31',
    )
  })

  it('devolve a própria âncora quando ela já serve', () => {
    expect(firstOccurrenceOnOrAfter(rule('FREQ=DAILY'), '2026-09-07', '2026-09-07')).toBe(
      '2026-09-07',
    )
  })

  it('encaixa a âncora no primeiro dia válido de um BYDAY', () => {
    // Âncora numa terça, série às segundas: a primeira ocorrência é a segunda
    // seguinte. É assim que o service normaliza `starts_on` ao criar a série.
    expect(firstOccurrenceOnOrAfter(rule('FREQ=WEEKLY;BYDAY=MO'), '2026-09-08', '2026-09-08')).toBe(
      '2026-09-14',
    )
  })

  it('devolve null quando a série já acabou', () => {
    expect(
      firstOccurrenceOnOrAfter(rule('FREQ=DAILY;UNTIL=20260910'), '2026-09-07', '2026-09-11'),
    ).toBeNull()
    expect(
      firstOccurrenceOnOrAfter(rule('FREQ=DAILY;COUNT=3'), '2026-09-07', '2026-09-11'),
    ).toBeNull()
  })
})

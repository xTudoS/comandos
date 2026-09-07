import { describe, it, expect } from 'vitest'
import {
  DAY_END_MIN,
  MIN_RANGE_MIN,
  fitsInFreeRange,
  formatDuration,
  freeRanges,
  mergeIntervals,
  minToTime,
  subtractIntervals,
  timeToMin,
  type Interval,
} from '~~/shared/bookingRanges'

/** Açúcar: 'HH:MM'–'HH:MM' → Interval, para os casos ficarem legíveis. */
function busy(start: string, end: string): Interval {
  return { start: timeToMin(start), end: timeToMin(end) }
}

/** Faixas como 'HH:MM–HH:MM', que é o que o teste quer comparar. */
function labels(ranges: { start: string; end: string }[]): string[] {
  return ranges.map((r) => `${r.start}–${r.end}`)
}

describe('timeToMin / minToTime', () => {
  it('converte ida e volta', () => {
    expect(timeToMin('00:00')).toBe(0)
    expect(timeToMin('09:30')).toBe(570)
    expect(timeToMin('23:59')).toBe(DAY_END_MIN)
    expect(minToTime(0)).toBe('00:00')
    expect(minToTime(570)).toBe('09:30')
    expect(minToTime(DAY_END_MIN)).toBe('23:59')
  })

  it('trava minToTime no fim do dia em vez de estourar para 24:xx', () => {
    expect(minToTime(1440)).toBe('23:59')
    expect(minToTime(-30)).toBe('00:00')
  })
})

describe('mergeIntervals', () => {
  it('funde sobrepostos', () => {
    expect(mergeIntervals([busy('09:00', '10:00'), busy('09:30', '11:00')])).toEqual([
      busy('09:00', '11:00'),
    ])
  })

  it('funde adjacentes — senão sobra uma faixa livre de comprimento zero entre eles', () => {
    expect(mergeIntervals([busy('09:00', '10:00'), busy('10:00', '11:00')])).toEqual([
      busy('09:00', '11:00'),
    ])
  })

  it('absorve o aninhado dentro do maior', () => {
    expect(mergeIntervals([busy('09:00', '12:00'), busy('10:00', '10:30')])).toEqual([
      busy('09:00', '12:00'),
    ])
  })

  it('ordena entradas fora de ordem e mantém separados os que não se tocam', () => {
    expect(mergeIntervals([busy('14:00', '15:00'), busy('09:00', '10:00')])).toEqual([
      busy('09:00', '10:00'),
      busy('14:00', '15:00'),
    ])
  })

  it('descarta intervalos vazios e invertidos', () => {
    expect(mergeIntervals([busy('09:00', '09:00'), { start: 600, end: 540 }])).toEqual([])
  })

  it('trunca no fim do dia quem cruza a meia-noite', () => {
    // Tarefa às 23:00 com 120min de duração: o transbordo NÃO vira ocupação do
    // dia seguinte, ele simplesmente para às 23:59.
    expect(mergeIntervals([{ start: timeToMin('23:00'), end: timeToMin('23:00') + 120 }])).toEqual([
      { start: timeToMin('23:00'), end: DAY_END_MIN },
    ])
  })
})

describe('subtractIntervals', () => {
  it('devolve o dia inteiro quando não há ocupado', () => {
    expect(subtractIntervals({ start: 0, end: DAY_END_MIN }, [])).toEqual([
      { start: 0, end: DAY_END_MIN },
    ])
  })

  it('abre buraco no meio', () => {
    expect(
      subtractIntervals({ start: 0, end: DAY_END_MIN }, [busy('09:00', '10:00')]),
    ).toEqual([busy('00:00', '09:00'), { start: timeToMin('10:00'), end: DAY_END_MIN }])
  })

  it('não devolve nada quando o ocupado cobre o dia todo', () => {
    expect(
      subtractIntervals({ start: 0, end: DAY_END_MIN }, [{ start: 0, end: DAY_END_MIN }]),
    ).toEqual([])
  })
})

describe('freeRanges', () => {
  it('dia vazio vira uma faixa só, de ponta a ponta', () => {
    expect(labels(freeRanges([]))).toEqual(['00:00–23:59'])
  })

  it('dia com dois compromissos vira três faixas', () => {
    const ranges = freeRanges([busy('09:30', '10:00'), busy('12:00', '13:00')])
    expect(labels(ranges)).toEqual(['00:00–09:30', '10:00–12:00', '13:00–23:59'])
  })

  it('dia totalmente ocupado não devolve faixa nenhuma', () => {
    expect(freeRanges([{ start: 0, end: DAY_END_MIN }])).toEqual([])
  })

  it('fromMin corta o que já passou', () => {
    const ranges = freeRanges([busy('09:30', '10:00')], { fromMin: timeToMin('08:00') })
    expect(labels(ranges)).toEqual(['08:00–09:30', '10:00–23:59'])
  })

  it('fromMin dentro de um compromisso não ressuscita o pedaço anterior', () => {
    const ranges = freeRanges([busy('09:00', '10:00')], { fromMin: timeToMin('09:30') })
    expect(labels(ranges)).toEqual(['10:00–23:59'])
  })

  it('descarta a faixa curta demais entre dois compromissos', () => {
    const ranges = freeRanges([busy('09:00', '10:00'), busy('10:03', '11:00')])
    expect(labels(ranges)).toEqual(['00:00–09:00', '11:00–23:59'])
  })

  it('mantém a faixa que bate exatamente o mínimo', () => {
    const gapEnd = minToTime(timeToMin('10:00') + MIN_RANGE_MIN)
    const ranges = freeRanges([busy('09:00', '10:00'), busy(gapEnd, '11:00')])
    expect(labels(ranges)).toContain(`10:00–${gapEnd}`)
  })

  it('junta compromissos adjacentes num buraco só', () => {
    const ranges = freeRanges([busy('09:00', '10:00'), busy('10:00', '11:00')])
    expect(labels(ranges)).toEqual(['00:00–09:00', '11:00–23:59'])
  })
})

describe('fitsInFreeRange', () => {
  const free = freeRanges([busy('09:30', '10:00'), busy('12:00', '13:00')])

  it('aceita um pedido no meio de uma faixa', () => {
    expect(fitsInFreeRange(busy('10:15', '10:45'), free)).toBe(true)
  })

  it('aceita um pedido colado nos dois limites da faixa', () => {
    expect(fitsInFreeRange(busy('10:00', '12:00'), free)).toBe(true)
  })

  it('recusa um pedido que invade o compromisso por um minuto', () => {
    expect(fitsInFreeRange(busy('10:00', '12:01'), free)).toBe(false)
    expect(fitsInFreeRange(busy('09:29', '09:31'), free)).toBe(false)
  })

  it('recusa um pedido que atravessa duas faixas — no meio está o compromisso', () => {
    expect(fitsInFreeRange(busy('09:00', '11:00'), free)).toBe(false)
  })

  it('recusa fim menor ou igual ao início', () => {
    expect(fitsInFreeRange(busy('10:00', '10:00'), free)).toBe(false)
    expect(fitsInFreeRange(busy('10:30', '10:00'), free)).toBe(false)
  })

  it('recusa qualquer coisa quando não há faixa livre', () => {
    expect(fitsInFreeRange(busy('10:00', '10:30'), [])).toBe(false)
  })
})

describe('formatDuration', () => {
  it('formata as três faixas de grandeza', () => {
    expect(formatDuration(30)).toBe('30 min')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(150)).toBe('2h30')
  })
})

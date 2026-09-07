import { describe, it, expect } from 'vitest'
import {
  DEFAULT_COUNTRY,
  formatInternational,
  formatNational,
  fromE164,
  isValidPhone,
  phoneCountries,
  toE164,
  toWhatsappDigits,
} from '~~/shared/phone'

describe('phoneCountries', () => {
  it('põe Brasil, Portugal e EUA no topo e traduz os nomes', () => {
    const list = phoneCountries()
    expect(list.slice(0, 3).map((c) => c.code)).toEqual(['BR', 'PT', 'US'])
    expect(list[0]).toMatchObject({ code: 'BR', name: 'Brasil', dial: '55' })
    expect(list[2]).toMatchObject({ code: 'US', dial: '1' })
  })

  it('cobre o mundo todo e não repete país', () => {
    const list = phoneCountries()
    expect(list.length).toBeGreaterThan(200)
    expect(new Set(list.map((c) => c.code)).size).toBe(list.length)
  })

  it('ordena o resto alfabeticamente em pt-BR', () => {
    const rest = phoneCountries().slice(3)
    const names = rest.map((c) => c.name)
    expect([...names].sort((a, b) => a.localeCompare(b, 'pt-BR'))).toEqual(names)
  })
})

describe('formatNational — a máscara', () => {
  it('formata celular e fixo brasileiros', () => {
    expect(formatNational('11988887777', 'BR')).toBe('(11) 98888-7777')
    expect(formatNational('1133334444', 'BR')).toBe('(11) 3333-4444')
  })

  it('formata progressivamente, dígito a dígito', () => {
    expect(formatNational('1', 'BR')).toBe('1')
    // O DDD fecha assim que tem os dois dígitos — antes mesmo do número começar.
    expect(formatNational('11', 'BR')).toBe('(11)')
    expect(formatNational('119', 'BR')).toBe('(11) 9')
    expect(formatNational('119888', 'BR')).toBe('(11) 9888')
  })

  it('usa o padrão de cada país, não o brasileiro', () => {
    expect(formatNational('2015550123', 'US')).toBe('(201) 555-0123')
    expect(formatNational('912345678', 'PT')).toBe('912 345 678')
  })

  it('descarta o que não for dígito e devolve vazio para entrada vazia', () => {
    expect(formatNational('(11) 98888-7777', 'BR')).toBe('(11) 98888-7777')
    expect(formatNational('abc', 'BR')).toBe('')
    expect(formatNational('', 'BR')).toBe('')
  })
})

describe('toE164 / fromE164', () => {
  it('monta o E.164 a partir do país escolhido', () => {
    expect(toE164('(11) 98888-7777', 'BR')).toBe('+5511988887777')
    expect(toE164('201 555 0123', 'US')).toBe('+12015550123')
    expect(toE164('912345678', 'PT')).toBe('+351912345678')
  })

  it('não inventa número quando não há dígito', () => {
    expect(toE164('', 'BR')).toBe('')
    expect(toE164('---', 'BR')).toBe('')
  })

  it('mantém o país no valor mesmo com o número ainda incompleto', () => {
    // A pessoa digitou só metade: o valor não pode ficar ambíguo quanto ao país.
    expect(toE164('119', 'BR')).toBe('+55119')
  })

  it('faz o caminho de volta, preservando país e máscara', () => {
    expect(fromE164('+5511988887777')).toEqual({ country: 'BR', national: '(11) 98888-7777' })
    expect(fromE164('+12015550123')).toEqual({ country: 'US', national: '(201) 555-0123' })
  })

  it('ida e volta é estável', () => {
    for (const e164 of ['+5511988887777', '+12015550123', '+351912345678']) {
      const { country, national } = fromE164(e164)
      expect(toE164(national, country)).toBe(e164)
    }
  })

  it('entrada que não é E.164 volta no país padrão, sem quebrar', () => {
    expect(fromE164('')).toEqual({ country: DEFAULT_COUNTRY, national: '' })
    // Número legado, gravado antes do campo ter país.
    expect(fromE164('(11) 98888-7777')).toEqual({
      country: DEFAULT_COUNTRY,
      national: '(11) 98888-7777',
    })
  })
})

describe('isValidPhone', () => {
  it('aceita números válidos de países diferentes', () => {
    expect(isValidPhone('+5511988887777')).toBe(true)
    expect(isValidPhone('+12015550123')).toBe(true)
    expect(isValidPhone('+351912345678')).toBe(true)
  })

  it('recusa incompleto, vazio e lixo', () => {
    expect(isValidPhone('+5511')).toBe(false)
    expect(isValidPhone('')).toBe(false)
    expect(isValidPhone('11988887777')).toBe(false) // sem país é ambíguo
    expect(isValidPhone('+9999999999999')).toBe(false)
  })
})

describe('saída', () => {
  it('formata para leitura', () => {
    expect(formatInternational('+5511988887777')).toBe('+55 11 98888 7777')
  })

  it('gera os dígitos que o wa.me espera — com país, sem "+"', () => {
    expect(toWhatsappDigits('+5511988887777')).toBe('5511988887777')
  })
})

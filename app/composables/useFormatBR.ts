// useFormatBR — per design-spec-comando.md §11.3
//
// Reaproveita helpers já existentes em utils/dates.ts e utils/money.ts (que
// Nuxt auto-importa). Adiciona apenas o que falta: BRL formatters e helpers
// baseados em date-fns. NÃO re-exporta fmtDate/fmtBRDate/etc no nível de
// módulo para evitar colisão com utils/dates.ts no auto-import do Nuxt.

import {
  format as fnsFormat,
  parseISO,
  isValid as fnsIsValid,
  differenceInCalendarDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  DOW,
  DOW_FULL,
  DOW_SHORT,
  MESES,
  fmtDate as utilsFmtDate,
  fmtBRDate as utilsFmtBRDate,
  fmtNowStamp as utilsFmtNowStamp,
  addDays as utilsAddDays,
  addMonths as utilsAddMonths,
} from '~/utils/dates'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const BRL_SHORT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function toDate(d: Date | string): Date {
  if (typeof d !== 'string') return d
  if (d.includes('T')) return parseISO(d)
  return new Date(d + 'T12:00:00')
}

// Não-colidente com nada em utils/.
export function fmtBRDateLong(d: Date | string): string {
  return fnsFormat(toDate(d), "EEE, d 'de' MMMM · yyyy", { locale: ptBR })
}

export function fmtBRL(reais: number): string {
  return BRL.format(reais)
}

export function fmtBRLShort(reais: number): string {
  if (Math.abs(reais) >= 1000) {
    return `R$ ${(reais / 1000).toFixed(1).replace('.', ',')}k`
  }
  return BRL_SHORT.format(reais)
}

export function fmtBRLFromCents(cents: number): string {
  return BRL.format(cents / 100)
}

export function diasEntre(a: Date | string, b: Date | string): number {
  return differenceInCalendarDays(toDate(a), toDate(b))
}

export function isValidDate(d: Date | string): boolean {
  return fnsIsValid(toDate(d))
}

export function useFormatBR() {
  return {
    fmtDate: utilsFmtDate,
    fmtBRDate: utilsFmtBRDate,
    fmtBRDateLong,
    fmtNowStamp: utilsFmtNowStamp,
    fmtBRL,
    fmtBRLShort,
    fmtBRLFromCents,
    addDays: utilsAddDays,
    addMonths: utilsAddMonths,
    diasEntre,
    isValidDate,
    DOW,
    DOW_FULL,
    DOW_SHORT,
    MESES,
  }
}

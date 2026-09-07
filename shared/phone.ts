/**
 * Telefone internacional — lógica pura, sem banco e sem Vue.
 *
 * O campo de WhatsApp era texto livre com um `min(5)` genérico. Isso tinha dois
 * defeitos que só apareciam depois: aceitava lixo, e produzia um link `wa.me`
 * quebrado. O `wa.me` exige o número em formato internacional completo; um
 * "(11) 98888-7777" digitado sem país vira `wa.me/11988887777`, que não é um
 * número válido em lugar nenhum do mundo.
 *
 * A resposta é guardar sempre **E.164** (`+5511988887777`) e deixar a máscara e
 * a validação por conta da `libphonenumber-js`, que carrega as regras reais de
 * cada país. Escrever isso à mão é o tipo de coisa que funciona para o Brasil e
 * quebra silenciosamente para todo o resto — e o visitante pode ser de qualquer
 * lugar.
 *
 * Os NOMES dos países não vêm da biblioteca: `Intl.DisplayNames` já entrega a
 * lista localizada em pt-BR sem custo de bundle.
 */

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js'

export type PhoneCountry = {
  code: CountryCode
  /** Nome em pt-BR, ex.: "Brasil". */
  name: string
  /** Código de discagem sem o "+", ex.: "55". */
  dial: string
}

/** País assumido quando não dá para inferir nada. */
export const DEFAULT_COUNTRY: CountryCode = 'BR'

/**
 * Países no topo da lista. Não é favoritismo: numa lista de ~250 opções, os
 * poucos casos que respondem pela esmagadora maioria dos agendamentos merecem
 * estar ao alcance sem rolagem.
 */
const PINNED: CountryCode[] = ['BR', 'PT', 'US']

let cachedCountries: PhoneCountry[] | null = null

/** Lista completa, com os fixados no topo e o resto em ordem alfabética. */
export function phoneCountries(): PhoneCountry[] {
  if (cachedCountries) return cachedCountries

  // `Intl.DisplayNames` existe em todo runtime que nos interessa, mas se algum
  // dia faltar (ICU enxuto), cair no próprio código ISO é melhor que quebrar.
  let display: Intl.DisplayNames | null = null
  try {
    display = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
  } catch {
    display = null
  }

  const all = getCountries().map((code) => ({
    code,
    name: display?.of(code) ?? code,
    dial: getCountryCallingCode(code),
  }))

  const pinned = PINNED.map((c) => all.find((x) => x.code === c)).filter(
    (x): x is PhoneCountry => !!x,
  )
  const rest = all
    .filter((x) => !PINNED.includes(x.code))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  cachedCountries = [...pinned, ...rest]
  return cachedCountries
}

/**
 * Máscara progressiva: formata enquanto se digita, no padrão do país.
 * `11988887777` + BR → `(11) 98888-7777`. Só dígitos entram.
 */
export function formatNational(input: string, country: CountryCode): string {
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''
  // O AsYouType guarda estado interno; uma instância por chamada é o uso correto.
  return new AsYouType(country).input(digits)
}

/** E.164 a partir do país + número nacional. Vazio se não houver dígitos. */
export function toE164(national: string, country: CountryCode): string {
  const digits = national.replace(/\D/g, '')
  if (!digits) return ''
  const parsed = parsePhoneNumberFromString(digits, country)
  // Sem número válido ainda (a pessoa está no meio da digitação), monta o E.164
  // "cru" para o valor nunca ficar ambíguo quanto ao país.
  return parsed?.number ?? `+${getCountryCallingCode(country)}${digits}`
}

/**
 * Quebra um E.164 de volta em país + nacional formatado, para reidratar o campo.
 * Entrada que não seja E.164 volta como país padrão e o texto original.
 */
export function fromE164(value: string): { country: CountryCode; national: string } {
  const parsed = value.startsWith('+') ? parsePhoneNumberFromString(value) : null
  if (!parsed?.country) {
    return { country: DEFAULT_COUNTRY, national: formatNational(value, DEFAULT_COUNTRY) }
  }
  return {
    country: parsed.country,
    national: formatNational(parsed.nationalNumber, parsed.country),
  }
}

/**
 * O número é válido para o país dele?
 *
 * Usada nos DOIS lados: o cliente para acusar o erro no campo, o servidor como
 * portão. Regra única — foi a divergência entre um "obrigatório" no cliente e um
 * `min(5)` no servidor que deixava a pessoa levar um 400 só na revisão.
 */
export function isValidPhone(e164: string): boolean {
  if (!e164) return false
  return parsePhoneNumberFromString(e164)?.isValid() ?? false
}

/** Formato internacional legível, ex.: `+55 11 98888-7777`. */
export function formatInternational(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164
}

/** Só os dígitos, como o `wa.me` espera (sem "+", com código de país). */
export function toWhatsappDigits(e164: string): string {
  return e164.replace(/\D/g, '')
}

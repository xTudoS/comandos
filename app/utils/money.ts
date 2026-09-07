const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatBRL(cents: number): string {
  return BRL.format(cents / 100)
}

// Parse a BRL-style user input ("1.234,56", "R$ 12,00", "12") into cents.
// Returns null when the input doesn't parse to a positive number.
export function parseBRLToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').trim()
  if (!cleaned) return null
  // Decide separator: if both present, the rightmost is the decimal. Else,
  // comma is decimal (pt-BR convention).
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized: string
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned
  } else if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = cleaned.replace(/,/g, '')
  }
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

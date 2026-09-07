import { describe, it, expect } from 'vitest'
import { useDb } from '~/server/utils/db'

describe('useDb', () => {
  it('creates a fresh drizzle instance per event', () => {
    const mockEvent = {
      context: {
        cloudflare: {
          env: { HYPERDRIVE: { connectionString: 'postgres://fake:fake@localhost:5432/test' } },
        },
      },
    } as any
    const db1 = useDb(mockEvent)
    const db2 = useDb(mockEvent)
    expect(db1).toBeDefined()
    expect(db2).toBeDefined()
    expect(db1).not.toBe(db2)
  })

  it('throws when Hyperdrive binding is missing', () => {
    const mockEvent = { context: { cloudflare: { env: {} } } } as any
    expect(() => useDb(mockEvent)).toThrow(/HYPERDRIVE/)
  })

  it('returns the context._db override when present (test-mode escape hatch)', () => {
    const fake = { __marker: 'test-db' }
    const mockEvent = { context: { _db: fake } } as any
    expect(useDb(mockEvent)).toBe(fake)
  })
})

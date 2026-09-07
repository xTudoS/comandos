import { describe, it, expect } from 'vitest'
import { diffFields, inferAction } from '~~/server/utils/audit'

describe('diffFields', () => {
  it('returns only changed fields with from/to', () => {
    const a = {
      title: 'x',
      done: false,
      horizon: 'core30',
      updatedAt: new Date('2026-01-01'),
    }
    const b = {
      title: 'y',
      done: false,
      horizon: 'core60',
      updatedAt: new Date('2026-01-02'),
    }
    expect(diffFields(a, b)).toEqual({
      title: { from: 'x', to: 'y' },
      horizon: { from: 'core30', to: 'core60' },
    })
  })

  it('treats Date equality by getTime, not identity', () => {
    const a = { when: new Date('2026-01-01T00:00:00Z') }
    const b = { when: new Date('2026-01-01T00:00:00Z') }
    expect(diffFields(a, b)).toEqual({})
  })

  it('ignores updatedAt / updated_at / atualizada_em by default', () => {
    const a = { a: 1, updatedAt: new Date(0), updated_at: new Date(0), atualizada_em: new Date(0) }
    const b = { a: 1, updatedAt: new Date(99), updated_at: new Date(99), atualizada_em: new Date(99) }
    expect(diffFields(a, b)).toEqual({})
  })

  it('accepts an additional ignore list', () => {
    const a = { name: 'alice', lastSeenAt: new Date(0) }
    const b = { name: 'bob', lastSeenAt: new Date(99) }
    expect(diffFields(a, b, { ignore: ['lastSeenAt'] })).toEqual({
      name: { from: 'alice', to: 'bob' },
    })
  })

  it('distinguishes null from undefined', () => {
    const a = { value: null }
    const b = { value: undefined }
    expect(diffFields(a, b)).toEqual({ value: { from: null, to: undefined } })
  })

  it('flags new keys as from undefined', () => {
    expect(diffFields({}, { x: 1 })).toEqual({ x: { from: undefined, to: 1 } })
    expect(diffFields({ x: 1 }, {})).toEqual({ x: { from: 1, to: undefined } })
  })

  it('deep-equals plain objects and arrays', () => {
    expect(diffFields({ a: { x: 1, y: 2 } }, { a: { x: 1, y: 2 } })).toEqual({})
    expect(diffFields({ a: [1, 2] }, { a: [1, 2] })).toEqual({})
    expect(diffFields({ a: [1, 2] }, { a: [2, 1] })).toEqual({
      a: { from: [1, 2], to: [2, 1] },
    })
  })
})

describe('inferAction', () => {
  it('infers complete/uncomplete from the done flag', () => {
    expect(inferAction({ done: true }, { done: false }, { done: true })).toBe('complete')
    expect(inferAction({ done: false }, { done: true }, { done: false })).toBe('uncomplete')
  })

  it('infers archive/restore from the archived flag', () => {
    expect(inferAction({ archived: true }, { archived: false }, { archived: true })).toBe('archive')
    expect(inferAction({ archived: false }, { archived: true }, { archived: false })).toBe('restore')
  })

  it('infers reassign when delegate_person_id or delegatePersonId is in the patch', () => {
    expect(
      inferAction({ delegatePersonId: 'p2' }, { delegatePersonId: 'p1' }, { delegatePersonId: 'p2' }),
    ).toBe('reassign')
    expect(
      inferAction(
        { delegate_person_id: 'p2' },
        { delegate_person_id: 'p1' },
        { delegate_person_id: 'p2' },
      ),
    ).toBe('reassign')
  })

  it('falls back to update for plain field edits', () => {
    expect(inferAction({ title: 'y' }, { title: 'x' }, { title: 'y' })).toBe('update')
  })

  it('does not hijack action when done differs outside the patch', () => {
    // Stale read would show before.done=false, after.done=false — patch
    // didn't touch done, so we must return 'update' regardless of any
    // pre-existing state drift.
    expect(inferAction({ title: 'y' }, { done: false, title: 'x' }, { done: false, title: 'y' })).toBe(
      'update',
    )
  })

  it('precedence: done > archived > reassign > update', () => {
    // If both flipped in one patch, done wins.
    expect(
      inferAction(
        { done: true, archived: true },
        { done: false, archived: false },
        { done: true, archived: true },
      ),
    ).toBe('complete')
  })
})

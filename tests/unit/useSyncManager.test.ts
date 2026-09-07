import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSyncManager } from '~/composables/useSyncManager'
import { db } from '~/lib/db'

// Mocking navigator.onLine
if (typeof global.navigator === 'undefined') {
  ;(global as any).navigator = {
    onLine: true
  }
}

// Mocking $fetch since it's a global in Nuxt
;(global as any).$fetch = vi.fn()

describe('useSyncManager', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
    vi.clearAllMocks()
    ;(global as any).navigator.onLine = true
  })

  it('initializes with isSyncing as false', () => {
    const { isSyncing } = useSyncManager()
    expect(isSyncing.value).toBe(false)
  })

  it('processes items in the queue and deletes them on success', async () => {
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'CREATE',
      payload: { title: 'Test' },
      timestamp: Date.now()
    })

    const { processQueue, isSyncing } = useSyncManager()
    
    // Mocking $fetch to succeed
    ;(global.$fetch as any).mockResolvedValueOnce({})

    await processQueue()

    expect(isSyncing.value).toBe(false)
    const items = await db.syncQueue.toArray()
    expect(items.length).toBe(0)
  })

  it('stops processing if offline', async () => {
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'CREATE',
      payload: { title: 'Test' },
      timestamp: Date.now()
    })

    ;(global as any).navigator.onLine = false
    const { processQueue } = useSyncManager()
    
    await processQueue()

    const items = await db.syncQueue.toArray()
    expect(items.length).toBe(1)
  })

  it('stops processing if sync fails', async () => {
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'CREATE',
      payload: { title: 'Test 1' },
      timestamp: Date.now()
    })
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'CREATE',
      payload: { title: 'Test 2' },
      timestamp: Date.now() + 100
    })

    // Mocking $fetch to fail for the first item
    ;(global.$fetch as any).mockRejectedValueOnce(new Error('Sync failed'))

    const { processQueue } = useSyncManager()
    await processQueue()

    const items = await db.syncQueue.toArray()
    expect(items.length).toBe(2) // Should stop and NOT delete any
  })
})

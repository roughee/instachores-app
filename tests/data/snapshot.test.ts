import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createIdbKvStore } from '@/data/kvStore'
import type { KvStore } from '@/data/kvStore'
import { Snapshot } from '@/data/snapshot'
import { complete, household, reward, task } from '../helpers/fixtures'

function memoryStore(): KvStore {
  const map = new Map<string, unknown>()
  return {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value)
    },
    del: async (key) => {
      map.delete(key)
    },
  }
}

describe('Snapshot', () => {
  it('reads an empty snapshot with no data written yet', async () => {
    const snapshot = new Snapshot(memoryStore())
    const data = await snapshot.read()
    expect(data).toEqual({ members: [], tasks: [], rewards: [], events: [], skipped: 0 })
  })

  it('a snapshot written, then read after a simulated restart, yields the same parsed objects and cursor', async () => {
    const store = memoryStore()
    const h = household()
    const member = Object.values(h.members)[0]!
    const t = task()
    const r = reward()
    const e = complete(t)
    const cursor = new Date('2026-09-09T18:00:05.000Z')

    const writer = new Snapshot(store)
    await writer.write({ household: h, members: [member], tasks: [t], rewards: [r], events: [e], cursor })

    // A new instance over the same underlying store simulates the app restarting.
    const reader = new Snapshot(store)
    const data = await reader.read()

    expect(data.household).toEqual(h)
    expect(data.members).toEqual([member])
    expect(data.tasks).toEqual([t])
    expect(data.rewards).toEqual([r])
    expect(data.events).toEqual([e])
    expect(data.cursor).toEqual(cursor)
    expect(data.skipped).toBe(0)
  })

  it('round-trips through the default idb-keyval-backed store', async () => {
    const dbName = `snapshot-test-${Math.random()}`
    const h = household()
    const t = task()

    const writer = new Snapshot(createIdbKvStore(dbName))
    await writer.write({ household: h, members: [], tasks: [t], rewards: [], events: [] })

    const reader = new Snapshot(createIdbKvStore(dbName))
    const data = await reader.read()
    expect(data.household).toEqual(h)
    expect(data.tasks).toEqual([t])
  })

  it('a snapshot entry that fails to parse is skipped and reported, and the rest of the snapshot loads', async () => {
    const store = memoryStore()
    const good = task()
    const bad = { id: 'task-bad' }
    await store.set('household', household())
    await store.set('members', [])
    await store.set('tasks', [good, bad])
    await store.set('rewards', [])
    await store.set('events', [])

    const log = vi.fn()
    const snapshot = new Snapshot(store, { log })
    const data = await snapshot.read()

    expect(data.tasks).toEqual([good])
    expect(data.skipped).toBe(1)
    expect(log).toHaveBeenCalled()
  })

  it('skips a corrupt household without throwing, and still loads the rest', async () => {
    const store = memoryStore()
    const log = vi.fn()
    const t = task()
    await store.set('household', { id: 'not-a-household' })
    await store.set('tasks', [t])

    const snapshot = new Snapshot(store, { log })
    const data = await snapshot.read()

    expect(data.household).toBeUndefined()
    expect(data.tasks).toEqual([t])
    expect(data.skipped).toBe(1)
    expect(log).toHaveBeenCalled()
  })

  it('defaults the log hook to console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = memoryStore()
    await store.set('tasks', [{ garbage: true }])
    const snapshot = new Snapshot(store)
    const data = await snapshot.read()
    expect(data.skipped).toBe(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('ignores a stored cursor that fails to parse, counting it as skipped', async () => {
    const store = memoryStore()
    const log = vi.fn()
    await store.set('cursor', { not: 'a date' })
    const snapshot = new Snapshot(store, { log })
    const data = await snapshot.read()
    expect(data.cursor).toBeUndefined()
    expect(data.skipped).toBe(1)
    expect(log).toHaveBeenCalled()
  })

  it('writing without a household or cursor clears any previously stored ones', async () => {
    const store = memoryStore()
    const snapshot = new Snapshot(store)
    await snapshot.write({
      household: household(),
      members: [],
      tasks: [],
      rewards: [],
      events: [],
      cursor: new Date('2026-09-09T18:00:00.000Z'),
    })
    await snapshot.write({ members: [], tasks: [], rewards: [], events: [] })

    const data = await snapshot.read()
    expect(data.household).toBeUndefined()
    expect(data.cursor).toBeUndefined()
  })
})

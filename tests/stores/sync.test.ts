import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepo } from '@/data/memoryRepo'
import { useSyncStore } from '@/stores/sync'
import { HID, household } from '../helpers/fixtures'
import { FakeSheetsRepo } from '../helpers/testRepo'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('syncStore.bind', () => {
  it('reflects the repo’s reported status synchronously', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const store = useSyncStore()
    store.bind(repo)
    expect(store.online).toBe(true)
    expect(store.outboxCount).toBe(0)
    expect(store.lastPollAt).toBeUndefined()
    expect(store.lastError).toBeUndefined()
    expect(store.skippedRows).toBe(0)
    expect(store.lastSkipped).toBeUndefined()
  })

  it('follows status changes the repo announces', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const store = useSyncStore()
    store.bind(repo)
    const listeners: ((s: {
      online: boolean
      outboxCount: number
      lastPollAt: Date | undefined
      lastError: string | undefined
      skippedRows: number
      lastSkipped: { tab: string; id: string } | undefined
      intervalMs: number
    }) => void)[] = []
    vi.spyOn(repo, 'watchStatus').mockImplementation((cb) => {
      listeners.push(cb)
      cb({
        online: false,
        outboxCount: 3,
        lastPollAt: undefined,
        lastError: 'boom',
        skippedRows: 1,
        lastSkipped: { tab: 'events', id: 'ev-bad' },
        intervalMs: 30_000,
      })
      return () => undefined
    })
    store.bind(repo)
    expect(store.online).toBe(false)
    expect(store.outboxCount).toBe(3)
    expect(store.lastError).toBe('boom')
    expect(store.skippedRows).toBe(1)
    expect(store.lastSkipped).toEqual({ tab: 'events', id: 'ev-bad' })
    expect(store.intervalMs).toBe(30_000)
  })
})

describe('syncStore.syncNow', () => {
  it('calls repo.sync() exactly once and returns its result', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const spy = vi.spyOn(repo, 'sync')
    const store = useSyncStore()
    store.bind(repo)

    const result = await store.syncNow()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(result?.pending).toBe(0)
  })

  it('is a no-op returning undefined when nothing is bound', async () => {
    const store = useSyncStore()
    await expect(store.syncNow()).resolves.toBeUndefined()
  })

  it('calls syncForeground() instead of sync() for a repo that has one, such as SheetsRepo (#52)', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const syncForeground = vi.fn(async () => ({ pending: 0, syncedAt: new Date() }))
    const withForegroundSync = Object.assign(repo, { syncForeground })
    const sync = vi.spyOn(withForegroundSync, 'sync')
    const store = useSyncStore()
    store.bind(withForegroundSync)

    await store.syncNow()

    expect(syncForeground).toHaveBeenCalledTimes(1)
    expect(sync).not.toHaveBeenCalled()
  })
})

describe('syncStore.scriptVersion', () => {
  it('stays undefined for MemoryRepo, which has no version() method', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const store = useSyncStore()
    store.bind(repo)
    await store.refreshVersion()
    expect(store.scriptVersion).toBeUndefined()
  })

  it('leaves scriptVersion undefined when version() itself rejects', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const failing = Object.assign(repo, {
      version: vi.fn(async () => {
        throw new Error('script unreachable')
      }),
    })
    const store = useSyncStore()
    store.bind(failing)
    await store.refreshVersion()
    expect(store.scriptVersion).toBeUndefined()
  })

  it('reads the version from a repo that exposes one, such as SheetsRepo', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const withVersion = Object.assign(repo, { version: vi.fn(async () => 'v3') })
    const store = useSyncStore()
    store.bind(withVersion)
    await store.refreshVersion()
    expect(store.scriptVersion).toBe('v3')
  })

  it('unbind clears the script version', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const withVersion = Object.assign(repo, { version: vi.fn(async () => 'v3') })
    const store = useSyncStore()
    store.bind(withVersion)
    await store.refreshVersion()
    store.unbind()
    expect(store.scriptVersion).toBeUndefined()
  })
})

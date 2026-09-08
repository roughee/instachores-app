import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepo } from '@/data/memoryRepo'
import { configureSession } from '@/stores/session'
import { useCatalogStore } from '@/stores/catalog'
import { ANA, HID, household, reward, task } from '../helpers/fixtures'

function unused(): never {
  throw new Error('not used in this test file')
}

const FIXED_NOW = new Date('2026-09-10T00:00:00.000Z')

beforeEach(() => {
  setActivePinia(createPinia())
  configureSession({
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    createSheetsRepo: unused,
    createDemoRepo: unused,
    now: () => FIXED_NOW,
  })
})

describe('catalogStore.bind', () => {
  it('receives tasks and rewards synchronously', () => {
    const t = task({ id: 'task-a' })
    const r = reward({ id: 'reward-a' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [t], rewards: [r] }])
    const store = useCatalogStore()
    store.bind(repo, HID)
    expect(store.tasks).toEqual([t])
    expect(store.rewards).toEqual([r])
  })

  it('byId looks tasks up by id', () => {
    const t = task({ id: 'task-a', name: 'Pots' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [t] }])
    const store = useCatalogStore()
    store.bind(repo, HID)
    expect(store.byId.get('task-a')?.name).toBe('Pots')
    expect(store.byId.get('missing')).toBeUndefined()
  })

  it('byCategory groups tasks by their category', () => {
    const kitchen = task({ id: 'task-k', category: 'kitchen' })
    const laundry = task({ id: 'task-l', category: 'laundry' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [kitchen, laundry] }])
    const store = useCatalogStore()
    store.bind(repo, HID)
    expect(store.byCategory.get('kitchen')).toEqual([kitchen])
    expect(store.byCategory.get('laundry')).toEqual([laundry])
  })

  it('byCategory keeps every task when two share a category', () => {
    const pots = task({ id: 'task-pots', category: 'kitchen', sort: 0 })
    const counters = task({ id: 'task-counters', category: 'kitchen', sort: 1 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots, counters] }])
    const store = useCatalogStore()
    store.bind(repo, HID)
    expect(store.byCategory.get('kitchen')).toEqual([pots, counters])
  })

  it('active excludes archived tasks', () => {
    const live = task({ id: 'task-live', archived: false })
    const gone = task({ id: 'task-gone', archived: true })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [live, gone] }])
    const store = useCatalogStore()
    store.bind(repo, HID)
    expect(store.active.map((t) => t.id)).toEqual(['task-live'])
  })
})

describe('catalogStore.updateTaskPoints', () => {
  it('upserts a new Task with the given points and updatedBy, stamped with the injected clock', async () => {
    const original = task({ id: 'task-a', points: 2, updatedAt: new Date('2026-01-01T00:00:00.000Z') })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [original] }])
    const store = useCatalogStore()
    store.bind(repo, HID)

    await store.updateTaskPoints('task-a', 9, ANA)

    expect(store.byId.get('task-a')?.points).toBe(9)
    expect(store.byId.get('task-a')?.updatedBy).toBe(ANA)
    expect(store.byId.get('task-a')?.updatedAt).toEqual(FIXED_NOW)
  })

  it('rejects an unknown task id', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const store = useCatalogStore()
    store.bind(repo, HID)
    await expect(store.updateTaskPoints('missing', 5, ANA)).rejects.toThrow()
  })

  it('rejects when no household is bound', async () => {
    const store = useCatalogStore()
    await expect(store.updateTaskPoints('task-a', 5, ANA)).rejects.toThrow('no household connected')
  })
})

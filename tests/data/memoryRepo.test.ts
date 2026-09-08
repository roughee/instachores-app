import { describe, expect, it, vi } from 'vitest'
import { buildDemoHousehold, DEMO_HOUSEHOLD_ID } from '@/data/demo'
import { createDemoRepo, MemoryRepo } from '@/data/memoryRepo'
import { RepoError } from '@/data/repo'
import { seedRewards, seedTasks } from '@/domain/seed'
import type { Household as HouseholdT, Reward as RewardT, Task as TaskT } from '@/schemas'
import { ANA, HID, NOW, complete, event, household, reward, task } from '../helpers/fixtures'

describe('watchEvents', () => {
  it('fires synchronously with the current list and again after each appendEvent; unsubscribe stops further calls', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const seen: number[] = []
    const unsub = repo.watchEvents(HID, new Date(0), (events) => seen.push(events.length))
    expect(seen).toEqual([0])

    const t = task()
    await repo.appendEvent(HID, complete(t))
    expect(seen).toEqual([0, 1])

    unsub()
    await repo.appendEvent(HID, complete(t))
    expect(seen).toEqual([0, 1])
  })

  it('delivers only events at or after since, sorted by at', () => {
    const t = task()
    const early = event('complete', { taskId: t.id, forUid: ANA, points: 2, at: new Date('2026-09-01T00:00:00.000Z') })
    const late = event('complete', { taskId: t.id, forUid: ANA, points: 2, at: new Date('2026-09-05T00:00:00.000Z') })
    const repo = new MemoryRepo([{ id: HID, household: household(), events: [late, early] }])
    let received: unknown[] = []
    repo.watchEvents(HID, new Date('2026-09-02T00:00:00.000Z'), (e) => (received = e))
    expect(received).toEqual([late])
  })
})

describe('appendEvent idempotency', () => {
  it('appending an event whose id already exists is a no-op: no duplicate, no second watcher call', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const calls: number[] = []
    repo.watchEvents(HID, new Date(0), (e) => calls.push(e.length))
    const c = complete(task())
    await repo.appendEvent(HID, c)
    await repo.appendEvent(HID, c)
    expect(calls).toEqual([0, 1])
  })
})

describe('upsertTask last-write-wins', () => {
  it('rejects an older updatedAt than the stored row, with a conflict code, and leaves the stored row unchanged', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const current = task({ id: 'task-x', name: 'Current', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertTask(HID, current)

    const stale = task({ id: 'task-x', name: 'Stale', updatedAt: new Date('2026-09-01T00:00:00.000Z') })
    let caught: unknown
    try {
      await repo.upsertTask(HID, stale)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(RepoError)
    expect((caught as RepoError).code).toBe('conflict')

    let seen: TaskT[] = []
    repo.watchTasks(HID, (t) => (seen = t))
    expect(seen).toEqual([current])
  })

  it('accepts a newer or equal updatedAt', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const first = task({ id: 'task-x', name: 'First', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertTask(HID, first)
    const newer = task({ id: 'task-x', name: 'Newer', updatedAt: new Date('2026-09-06T00:00:00.000Z') })
    await repo.upsertTask(HID, newer)

    let seen: TaskT[] = []
    repo.watchTasks(HID, (t) => (seen = t))
    expect(seen).toEqual([newer])
  })
})

describe('upsertReward last-write-wins', () => {
  it('rejects an older updatedAt than the stored row', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const current = reward({ id: 'reward-x', name: 'Current', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertReward(HID, current)
    const stale = reward({ id: 'reward-x', name: 'Stale', updatedAt: new Date('2026-09-01T00:00:00.000Z') })
    await expect(repo.upsertReward(HID, stale)).rejects.toMatchObject({ code: 'conflict' })

    let seen: RewardT[] = []
    repo.watchRewards(HID, (r) => (seen = r))
    expect(seen).toEqual([current])
  })

  it('accepts a newer updatedAt and replaces the stored row', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const first = reward({ id: 'reward-x', name: 'First', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertReward(HID, first)
    const newer = reward({ id: 'reward-x', name: 'Newer', updatedAt: new Date('2026-09-06T00:00:00.000Z') })
    await repo.upsertReward(HID, newer)

    let seen: RewardT[] = []
    repo.watchRewards(HID, (r) => (seen = r))
    expect(seen).toEqual([newer])
  })
})

describe('demo household', () => {
  it('has two adults and one kid, the full task catalog and the reward list', () => {
    const demo = buildDemoHousehold(NOW)
    const roles = Object.values(demo.household.members).map((m) => m.role)
    expect(roles.filter((r) => r === 'adult')).toHaveLength(2)
    expect(roles.filter((r) => r === 'kid')).toHaveLength(1)
    expect(demo.household.tz).toBe('Europe/Vilnius')
    expect(demo.tasks).toEqual(seedTasks(NOW, 'ana'))
    expect(demo.rewards).toEqual(seedRewards(NOW, 'ana'))
  })

  it('connect() returns the demo household, ignoring the link contents', async () => {
    const repo = createDemoRepo(NOW)
    const h: HouseholdT = await repo.connect({ url: 'https://script.google.com/exec', secret: 'x'.repeat(12) })
    expect(h.id).toBe(DEMO_HOUSEHOLD_ID)
    expect(Object.keys(h.members).sort()).toEqual(['ana', 'ben', 'mia'])
  })

  it('serves the full catalog and reward list through watchTasks/watchRewards', () => {
    const repo = createDemoRepo(NOW)
    let tasks: TaskT[] = []
    let rewards: RewardT[] = []
    repo.watchTasks(DEMO_HOUSEHOLD_ID, (t) => (tasks = t))
    repo.watchRewards(DEMO_HOUSEHOLD_ID, (r) => (rewards = r))
    expect(tasks).toHaveLength(seedTasks(NOW, 'ana').length)
    expect(rewards).toHaveLength(seedRewards(NOW, 'ana').length)
  })

  it('sync() is a no-op that reports zero pending', async () => {
    const repo = createDemoRepo(NOW)
    const result = await repo.sync()
    expect(result.pending).toBe(0)
  })
})

describe('bad rows are skipped, not thrown', () => {
  it('skips a bad task row and logs it, keeping the good ones', () => {
    const log = vi.fn()
    const good = task({ id: 'task-good' })
    const bad = { id: 'task-bad', name: '' }
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [good, bad] }], { log })
    let seen: TaskT[] = []
    repo.watchTasks(HID, (t) => (seen = t))
    expect(seen).toEqual([good])
    expect(log).toHaveBeenCalled()
  })

  it('skips a bad reward row and logs it', () => {
    const log = vi.fn()
    const good = reward({ id: 'reward-good' })
    const bad = { id: 'reward-bad' }
    const repo = new MemoryRepo([{ id: HID, household: household(), rewards: [good, bad] }], { log })
    let seen: RewardT[] = []
    repo.watchRewards(HID, (r) => (seen = r))
    expect(seen).toEqual([good])
    expect(log).toHaveBeenCalled()
  })

  it('skips a bad event row and logs it', () => {
    const log = vi.fn()
    const good = complete(task())
    const bad = { id: 'ev-bad', type: 'complete' }
    const repo = new MemoryRepo([{ id: HID, household: household(), events: [good, bad] }], { log })
    let seen: unknown[] = []
    repo.watchEvents(HID, new Date(0), (e) => (seen = e))
    expect(seen).toEqual([good])
    expect(log).toHaveBeenCalled()
  })

  it('skips a bad household row and never calls the watcher', () => {
    const log = vi.fn()
    const repo = new MemoryRepo([{ id: HID, household: { id: HID } }], { log })
    const cb = vi.fn()
    repo.watchHousehold(HID, cb)
    expect(cb).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })

  it('defaults the log hook to console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo = new MemoryRepo([{ id: HID, household: { id: HID } }])
    repo.watchHousehold(HID, () => {})
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('watchHousehold', () => {
  it('fires synchronously with the current household', () => {
    const h = household()
    const repo = new MemoryRepo([{ id: HID, household: h }])
    const cb = vi.fn()
    const unsub = repo.watchHousehold(HID, cb)
    expect(cb).toHaveBeenCalledWith(h)
    unsub()
  })
})

describe('an unseeded household id', () => {
  it('reads as empty lists rather than throwing', () => {
    const repo = new MemoryRepo()
    let tasks: TaskT[] = []
    repo.watchTasks('unknown-household', (t) => (tasks = t))
    expect(tasks).toEqual([])

    let events: unknown[] = []
    repo.watchEvents('unknown-household', new Date(0), (e) => (events = e))
    expect(events).toEqual([])
  })

  it('a non-object row is skipped like any other bad row, including in the append id check', async () => {
    const log = vi.fn()
    const good = complete(task())
    const repo = new MemoryRepo([{ id: HID, household: household(), events: [good, 'garbage', null] }], { log })
    let seen: unknown[] = []
    repo.watchEvents(HID, new Date(0), (e) => (seen = e))
    expect(seen).toEqual([good])
    expect(log).toHaveBeenCalled()

    await repo.appendEvent(HID, complete(task()))
    expect(seen).toHaveLength(2)
  })
})

describe('writes parse before they are stored (every boundary goes through Zod)', () => {
  it('appendEvent rejects an event that fails the schema and does not notify watchers', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const calls: number[] = []
    repo.watchEvents(HID, new Date(0), (e) => calls.push(e.length))
    const bad = { ...complete(task()), points: 999 } as unknown as Parameters<MemoryRepo['appendEvent']>[1]
    await expect(repo.appendEvent(HID, bad)).rejects.toThrow()
    expect(calls).toEqual([0])
  })

  it('upsertTask and upsertReward reject rows that fail the schema and leave the store unchanged', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    let tasks: TaskT[] = []
    let rewards: RewardT[] = []
    repo.watchTasks(HID, (t) => (tasks = t))
    repo.watchRewards(HID, (r) => (rewards = r))
    const badTask = { ...task(), points: 51 } as unknown as TaskT
    const badReward = { ...reward(), cost: 0 } as unknown as RewardT
    await expect(repo.upsertTask(HID, badTask)).rejects.toThrow()
    await expect(repo.upsertReward(HID, badReward)).rejects.toThrow()
    expect(tasks).toEqual([])
    expect(rewards).toEqual([])
  })
})

describe('watchStatus', () => {
  it('reports an always-online, empty-outbox status synchronously', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const seen: unknown[] = []
    const unsub = repo.watchStatus((s) => seen.push(s))
    expect(seen).toEqual([expect.objectContaining({ online: true, outboxCount: 0, skippedRows: 0 })])
    unsub()
  })
})

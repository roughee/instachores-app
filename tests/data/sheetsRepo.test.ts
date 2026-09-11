import { describe, expect, it, vi } from 'vitest'
import type { KvStore } from '@/data/kvStore'
import { Outbox } from '@/data/outbox'
import { RepoError } from '@/data/repo'
import { SheetsRepo } from '@/data/sheetsRepo'
import type { SheetsRepoStatus } from '@/data/sheetsRepo'
import { Snapshot } from '@/data/snapshot'
import type {
  ChoreEvent as ChoreEventT,
  Household as HouseholdT,
  Reward as RewardT,
  SetupLink,
  Task as TaskT,
} from '@/schemas'
import { ANA, BEN, HID, complete, event, household, reward, task } from '../helpers/fixtures'

const LINK: SetupLink = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'x'.repeat(12) }

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

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

function parsedBody(init: RequestInit | undefined): { action: string; [k: string]: unknown } {
  return JSON.parse(init?.body as string) as { action: string; [k: string]: unknown }
}

async function settle(): Promise<void> {
  // Lets a fire-and-forget background sync (promise-based, no real timer) finish.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('SheetsRepo: watchers fire synchronously from the snapshot', () => {
  it('calls back immediately from the loaded snapshot, never waiting on fetch', async () => {
    const store = memoryStore()
    const h = household()
    const t = task()
    await new Snapshot(store).write({
      household: h,
      members: Object.values(h.members),
      tasks: [t],
      rewards: [],
      events: [],
    })

    const fetchImpl = vi.fn(async () => {
      throw new Error('watch* must never call fetch')
    })
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(store),
      fetch: fetchImpl,
    })
    await repo.init()

    const householdCb = vi.fn()
    const tasksCb = vi.fn()
    repo.watchHousehold(HID, householdCb)
    repo.watchTasks(HID, tasksCb)

    expect(householdCb).toHaveBeenCalledWith(h)
    expect(tasksCb).toHaveBeenCalledWith([t])
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('SheetsRepo: connect', () => {
  it('bootstraps the household from the setup link, builds members from the members rows, and returns it', async () => {
    const rawHousehold = {
      v: '1',
      id: HID,
      name: 'Home',
      weeklyTarget: '250',
      tz: 'Europe/Vilnius',
      createdAt: '2026-09-01T00:00:00.000Z',
    }
    const rawMembers = [
      { uid: ANA, name: 'Ana', color: '#1f8a70', role: 'adult' },
      { uid: BEN, name: 'Ben', color: '#3f6fd4', role: 'adult' },
    ]
    const t = task()
    const r = reward()
    const e = complete(t)
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      expect(body.action).toBe('bootstrap')
      return jsonResponse({
        ok: true,
        household: rawHousehold,
        members: rawMembers,
        tasks: [t],
        rewards: [r],
        events: [e],
        serverTime: '2026-09-09T18:00:00.000Z',
      })
    })
    const snapshotStore = memoryStore()
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(snapshotStore),
      fetch: fetchImpl,
    })

    const h = await repo.connect(LINK)
    expect(h.id).toBe(HID)
    expect(h.tz).toBe('Europe/Vilnius')
    expect(Object.keys(h.members).sort()).toEqual([ANA, BEN].sort())
    expect(await snapshotStore.get('household')).toEqual(h)

    let seenTasks: TaskT[] = []
    repo.watchTasks(HID, (ts) => (seenTasks = ts))
    expect(seenTasks).toEqual([t])
  })

  it('rejects with the unauthorized code on a wrong secret and stores nothing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false, code: 'unauthorized' }))
    const snapshotStore = memoryStore()
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(snapshotStore),
      fetch: fetchImpl,
    })

    let caught: unknown
    try {
      await repo.connect(LINK)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(RepoError)
    expect((caught as RepoError).code).toBe('unauthorized')
    expect(await snapshotStore.get('household')).toBeUndefined()
    expect(await snapshotStore.get('tasks')).toBeUndefined()
  })

  it('names the tab and id of the last row bootstrap dropped for failing to parse, preferring the latest tab (issue #21)', async () => {
    const rawHousehold = {
      v: '1',
      id: HID,
      name: 'Home',
      weeklyTarget: '250',
      tz: 'Europe/Vilnius',
      createdAt: '2026-09-01T00:00:00.000Z',
    }
    const rawMembers = [{ uid: ANA, name: 'Ana', color: '#1f8a70', role: 'adult' }]
    const badTask = { id: 'task-bad', name: 'Broken' }
    const badEvent = { id: 'ev-bad', type: 'complete' }
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        household: rawHousehold,
        members: rawMembers,
        tasks: [badTask],
        rewards: [],
        events: [badEvent],
        serverTime: '2026-09-09T18:00:00.000Z',
      }),
    )
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })

    let status: SheetsRepoStatus | undefined
    repo.watchStatus((s) => (status = s))
    await repo.connect(LINK)

    expect(status?.skippedRows).toBe(2)
    // Events are parsed after tasks and rewards, so a bad row there wins as "last".
    expect(status?.lastSkipped).toEqual({ tab: 'events', id: 'ev-bad' })
  })
})

describe('SheetsRepo: outbox flush and retry', () => {
  it('posts an event appended offline once it is back online, drops it from the outbox only on confirmation, and never posts it twice', async () => {
    let online = false
    const calls: { action: string; [k: string]: unknown }[] = []
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      calls.push(body)
      if (!online) throw new TypeError('network request failed')
      if (body.action === 'events.append') {
        const events = body.events as { id: string }[]
        return jsonResponse({
          ok: true,
          appended: events.map((ev) => ev.id),
          skipped: [],
          loggedAt: '2026-09-09T18:05:00.000Z',
        })
      }
      if (body.action === 'events.since')
        return jsonResponse({ ok: true, events: [], serverTime: '2026-09-09T18:05:00.000Z' })
      throw new Error(`unexpected action in test: ${body.action}`)
    })

    const outbox = new Outbox(memoryStore())
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox,
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
    await repo.init()

    const c = complete(task())
    await repo.appendEvent(HID, c)
    expect((await outbox.pending()).map((entry) => entry.payload.id)).toEqual([c.id])

    // Still offline: the fire-and-forget flush triggered by appendEvent fails quietly.
    await settle()
    expect((await outbox.pending()).map((entry) => entry.payload.id)).toEqual([c.id])

    online = true
    const callsBeforeOnlineSync = calls.length
    const result = await repo.sync()
    expect(result.pending).toBe(0)
    expect(await outbox.pending()).toEqual([])

    // Exactly one events.append call happens once online, carrying only this event.
    const onlineCalls = calls.slice(callsBeforeOnlineSync)
    const onlineAppendCalls = onlineCalls.filter((b) => b.action === 'events.append')
    expect(onlineAppendCalls).toHaveLength(1)
    expect((onlineAppendCalls[0]?.events as { id: string }[]).map((ev) => ev.id)).toEqual([c.id])
    // events.append happens before events.since within one sync().
    expect(onlineCalls.findIndex((b) => b.action === 'events.append')).toBeLessThan(
      onlineCalls.findIndex((b) => b.action === 'events.since'),
    )

    // A second sync with nothing pending never re-sends the confirmed event.
    const totalAppendCallsSoFar = calls.filter((b) => b.action === 'events.append').length
    await repo.sync()
    expect(calls.filter((b) => b.action === 'events.append')).toHaveLength(totalAppendCallsSoFar)
  })

  it('retries locked and network outbox failures, keeping the entry queued, but drops conflict/invalid ones and surfaces the error', async () => {
    let mode: 'locked' | 'network' | 'conflict' | 'invalid' = 'locked'
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      if (body.action === 'events.append') {
        if (mode === 'network') throw new TypeError('offline')
        return jsonResponse({ ok: false, code: mode })
      }
      if (body.action === 'events.since') return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })

    const outbox = new Outbox(memoryStore())
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox,
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
    await repo.init()
    // Enqueued directly (bypassing appendEvent's own fire-and-forget flush) so each
    // sync() call below is the only thing driving the network, fully controlling timing.
    const c = complete(task())
    await outbox.enqueue('events.append', c)

    mode = 'locked'
    let result = await repo.sync()
    expect(result.retryable).toBe(1)
    expect(result.dropped ?? 0).toBe(0)
    expect((await outbox.pending()).map((e) => e.payload.id)).toEqual([c.id])

    mode = 'network'
    result = await repo.sync()
    expect(result.retryable).toBe(1)
    expect((await outbox.pending()).map((e) => e.payload.id)).toEqual([c.id])

    mode = 'conflict'
    result = await repo.sync()
    expect(result.dropped).toBe(1)
    expect(result.lastError).toBeDefined()
    expect(await outbox.pending()).toEqual([])

    const c2 = complete(task())
    await outbox.enqueue('events.append', c2)
    mode = 'invalid'
    result = await repo.sync()
    expect(result.dropped).toBe(1)
    expect(result.lastError).toBeDefined()
    expect(await outbox.pending()).toEqual([])
  })
})

describe('SheetsRepo: polling', () => {
  it('delivers the good rows from a poll to watchers and logs the bad row, without dropping the good ones', async () => {
    const log = vi.fn()
    const good1 = complete(task())
    const good2 = complete(task())
    const bad = { id: 'ev-bad', type: 'complete' }
    const badWithoutId = { type: 'complete' }
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      if (body.action === 'events.since')
        return jsonResponse({ ok: true, events: [good1, bad, badWithoutId, good2], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    // Seeded with a household already, so this poll is not also the first
    // sync with no household (#52), which would refresh the catalog instead.
    const snapshotStore = memoryStore()
    const h = household()
    await new Snapshot(snapshotStore).write({
      household: h,
      members: Object.values(h.members),
      tasks: [],
      rewards: [],
      events: [],
    })
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(snapshotStore),
      fetch: fetchImpl,
      log,
    })
    await repo.init()

    let seen: ChoreEventT[] = []
    repo.watchEvents(HID, new Date(0), (e) => (seen = e))
    const result = await repo.sync()

    expect(seen.map((e) => e.id).sort()).toEqual([good1.id, good2.id].sort())
    expect(result.pulled).toBe(2)
    expect(
      log.mock.calls.some(
        (call) => JSON.stringify(call).includes('ev-bad') && String(call[0]).toLowerCase().includes('event'),
      ),
    ).toBe(true)
  })

  it('advances the cursor to the largest loggedAt seen and sends it on the next poll', async () => {
    const t = task()
    const eA = event('complete', {
      taskId: t.id,
      forUid: ANA,
      points: 2,
      at: new Date('2026-09-01T00:00:00.000Z'),
      loggedAt: new Date('2026-09-01T00:00:02.000Z'),
    })
    const eB = event('complete', {
      taskId: t.id,
      forUid: ANA,
      points: 2,
      at: new Date('2026-09-01T00:00:01.000Z'),
      loggedAt: new Date('2026-09-01T00:00:05.000Z'),
    })
    const sinceSent: unknown[] = []
    let call = 0
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      if (body.action === 'events.since') {
        sinceSent.push(body.since)
        call++
        if (call === 1) return jsonResponse({ ok: true, events: [eA, eB], serverTime: 'x' })
        return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      }
      throw new Error(`unexpected action: ${body.action}`)
    })
    // Seeded with a household already, so these two polls are not also the
    // first sync with no household (#52), which would refresh the catalog
    // instead of polling on the first call.
    const snapshotStore = memoryStore()
    const h = household()
    await new Snapshot(snapshotStore).write({
      household: h,
      members: Object.values(h.members),
      tasks: [],
      rewards: [],
      events: [],
    })
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(snapshotStore),
      fetch: fetchImpl,
    })
    await repo.init()

    await repo.sync()
    await repo.sync()

    expect(sinceSent[0]).toBeUndefined()
    expect(sinceSent[1]).toBe(eB.loggedAt.toISOString())
  })

  it('names the tab and id of the last row a poll dropped for failing to parse (issue #21, Settings sync panel)', async () => {
    const good = complete(task())
    const bad = { id: 'ev-bad-1', type: 'complete' }
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      if (body.action === 'events.since') return jsonResponse({ ok: true, events: [good, bad], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    // Seeded with a household already, so this poll is not also the first
    // sync with no household (#52), which would refresh the catalog instead.
    const snapshotStore = memoryStore()
    const h = household()
    await new Snapshot(snapshotStore).write({
      household: h,
      members: Object.values(h.members),
      tasks: [],
      rewards: [],
      events: [],
    })
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(snapshotStore),
      fetch: fetchImpl,
    })
    await repo.init()

    let status: SheetsRepoStatus | undefined
    repo.watchStatus((s) => (status = s))
    await repo.sync()

    expect(status?.skippedRows).toBe(1)
    expect(status?.lastSkipped).toEqual({ tab: 'events', id: 'ev-bad-1' })
  })
})

describe('sync', () => {
  const CATALOG_HOUSEHOLD = {
    v: '1',
    id: HID,
    name: 'Home',
    weeklyTarget: '250',
    tz: 'Europe/Vilnius',
    createdAt: '2026-09-01T00:00:00.000Z',
  }
  const CATALOG_MEMBERS = [{ uid: ANA, name: 'Ana', color: '#1f8a70', role: 'adult' }]

  function bootstrapBody(
    overrides: {
      household?: unknown
      tasks?: unknown[]
      rewards?: unknown[]
      events?: unknown[]
    } = {},
  ): unknown {
    return {
      ok: true,
      household: CATALOG_HOUSEHOLD,
      members: CATALOG_MEMBERS,
      tasks: [],
      rewards: [],
      events: [],
      serverTime: 'x',
      ...overrides,
    }
  }

  function newRepo(fetchImpl: typeof fetch): SheetsRepo {
    return new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
  }

  it('refreshes tasks, rewards and household from bootstrap on the 10th sync', async () => {
    const actions: string[] = []
    const refreshedTask = task({ id: 'task-refreshed', name: 'Refreshed task' })
    const refreshedReward = reward({ id: 'reward-refreshed', name: 'Refreshed reward' })
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      actions.push(body.action)
      if (body.action === 'bootstrap')
        return jsonResponse(
          bootstrapBody({
            household: { ...CATALOG_HOUSEHOLD, name: 'Home Renamed' },
            tasks: [refreshedTask],
            rewards: [refreshedReward],
          }),
        )
      if (body.action === 'events.since') return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    const repo = newRepo(fetchImpl)
    await repo.connect(LINK)
    actions.length = 0 // Drop connect()'s own bootstrap call; only sync() calls count towards the cadence.

    for (let i = 0; i < 9; i++) await repo.sync()
    expect(actions).toEqual(Array(9).fill('events.since'))

    await repo.sync()
    expect(actions.at(-1)).toBe('bootstrap')

    let seenHousehold: HouseholdT | undefined
    repo.watchHousehold(HID, (h) => (seenHousehold = h))
    expect(seenHousehold?.name).toBe('Home Renamed')

    let seenTasks: TaskT[] = []
    repo.watchTasks(HID, (t) => (seenTasks = t))
    expect(seenTasks).toEqual([refreshedTask])

    let seenRewards: RewardT[] = []
    repo.watchRewards(HID, (r) => (seenRewards = r))
    expect(seenRewards).toEqual([refreshedReward])
  })

  it('polls events.since, not bootstrap, on the syncs in between', async () => {
    const actions: string[] = []
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      actions.push(body.action)
      if (body.action === 'bootstrap') return jsonResponse(bootstrapBody())
      if (body.action === 'events.since') return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    const repo = newRepo(fetchImpl)
    await repo.connect(LINK)
    actions.length = 0 // Drop connect()'s own bootstrap call.

    for (let i = 0; i < 9; i++) await repo.sync()
    expect(actions).toEqual(Array(9).fill('events.since'))
  })

  it('refreshes the catalog on a foreground or user-triggered sync', async () => {
    const actions: string[] = []
    const foregroundTask = task({ id: 'task-foreground', name: 'Foreground task' })
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      actions.push(body.action)
      if (body.action === 'bootstrap') return jsonResponse(bootstrapBody({ tasks: [foregroundTask] }))
      if (body.action === 'events.since') return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    const repo = newRepo(fetchImpl)
    await repo.connect(LINK)
    actions.length = 0 // Drop connect()'s own bootstrap call.

    // `onOnline()` is one of the three triggers the poller does not schedule
    // itself (the others are `syncNow()` and `onVisible()`); it must refresh
    // the catalog rather than poll, even though it is not the 10th sync.
    repo.onOnline()
    await settle()

    expect(actions).toEqual(['bootstrap'])
    let seenTasks: TaskT[] = []
    repo.watchTasks(HID, (t) => (seenTasks = t))
    expect(seenTasks).toEqual([foregroundTask])
  })

  it('refreshes on the first sync when the snapshot has no household', async () => {
    const actions: string[] = []
    const recoveredHousehold = { ...CATALOG_HOUSEHOLD, name: 'Recovered home' }
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      actions.push(body.action)
      if (body.action === 'bootstrap') return jsonResponse(bootstrapBody({ household: recoveredHousehold }))
      throw new Error(`unexpected action: ${body.action}`)
    })
    // No connect(): the snapshot is empty, as if a resumed session's stored
    // snapshot never got a household (#52).
    const repo = newRepo(fetchImpl)
    await repo.init()

    await repo.sync()

    expect(actions).toEqual(['bootstrap'])
    let seenHousehold: HouseholdT | undefined
    repo.watchHousehold(HID, (h) => (seenHousehold = h))
    expect(seenHousehold?.name).toBe('Recovered home')
  })

  it('keeps the current catalog and reports lastError when the refresh fails', async () => {
    let bootstrapCalls = 0
    const currentTask = task({ id: 'task-current' })
    const currentReward = reward({ id: 'reward-current' })
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      if (body.action === 'bootstrap') {
        bootstrapCalls++
        if (bootstrapCalls === 1) return jsonResponse(bootstrapBody({ tasks: [currentTask], rewards: [currentReward] }))
        throw new TypeError('network down')
      }
      if (body.action === 'events.since') return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    const repo = newRepo(fetchImpl)
    await repo.connect(LINK)

    let seenHousehold: HouseholdT | undefined
    repo.watchHousehold(HID, (h) => (seenHousehold = h))
    let seenTasks: TaskT[] = []
    repo.watchTasks(HID, (t) => (seenTasks = t))
    let seenRewards: RewardT[] = []
    repo.watchRewards(HID, (r) => (seenRewards = r))

    const result = await repo.syncForeground()

    expect(result.lastError).toBeDefined()
    expect(seenHousehold?.name).toBe(CATALOG_HOUSEHOLD.name)
    expect(seenTasks).toEqual([currentTask])
    expect(seenRewards).toEqual([currentReward])
  })

  it('a refresh never touches the outbox', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      if (body.action === 'bootstrap')
        return jsonResponse(bootstrapBody({ tasks: [task({ id: 'task-after-refresh' })] }))
      if (body.action === 'events.append') return jsonResponse({ ok: false, code: 'locked' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    const outbox = new Outbox(memoryStore())
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox,
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
    await repo.connect(LINK)

    const queued = complete(task())
    await outbox.enqueue('events.append', queued)

    const result = await repo.syncForeground()

    expect(result.retryable).toBe(1)
    expect((await outbox.pending()).map((e) => e.payload.id)).toEqual([queued.id])

    let seenTasks: TaskT[] = []
    repo.watchTasks(HID, (t) => (seenTasks = t))
    expect(seenTasks.map((t) => t.id)).toEqual(['task-after-refresh'])
  })
})

describe('SheetsRepo: poller backoff', () => {
  it('backs off to 2 minutes after three consecutive failures, and one success restores 30 seconds', async () => {
    vi.useFakeTimers()
    try {
      let mode: 'fail' | 'succeed' = 'fail'
      const fetchImpl = vi.fn(async () => {
        if (mode === 'fail') throw new TypeError('offline')
        return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      })
      const repo = new SheetsRepo({
        link: LINK,
        householdId: HID,
        outbox: new Outbox(memoryStore()),
        snapshot: new Snapshot(memoryStore()),
        fetch: fetchImpl,
        timers: { setTimeout, clearTimeout },
      })
      await repo.init()

      let status: SheetsRepoStatus | undefined
      repo.watchStatus((s) => (status = s))
      expect(status?.intervalMs).toBe(30_000)

      repo.start()
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(30_000)
      }
      expect(status?.intervalMs).toBe(120_000)

      mode = 'succeed'
      await vi.advanceTimersByTimeAsync(120_000)
      expect(status?.intervalMs).toBe(30_000)

      repo.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('pollIntervalMs overrides the 30s default, both at rest and after a poll restores it (issue #22)', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, events: [], serverTime: 'x' }))
      const repo = new SheetsRepo({
        link: LINK,
        householdId: HID,
        outbox: new Outbox(memoryStore()),
        snapshot: new Snapshot(memoryStore()),
        fetch: fetchImpl,
        timers: { setTimeout, clearTimeout },
        pollIntervalMs: 1_000,
      })
      await repo.init()

      let status: SheetsRepoStatus | undefined
      repo.watchStatus((s) => (status = s))
      expect(status?.intervalMs).toBe(1_000)

      repo.start()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(status?.intervalMs).toBe(1_000)

      repo.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('onVisible() and onOnline() poll immediately instead of waiting for the timer', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, events: [], serverTime: 'x' }))
      const repo = new SheetsRepo({
        link: LINK,
        householdId: HID,
        outbox: new Outbox(memoryStore()),
        snapshot: new Snapshot(memoryStore()),
        fetch: fetchImpl,
        timers: { setTimeout, clearTimeout },
      })
      await repo.init()
      repo.start()

      expect(fetchImpl).not.toHaveBeenCalled()
      repo.onOnline()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchImpl).toHaveBeenCalledTimes(1)

      repo.onVisible()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchImpl).toHaveBeenCalledTimes(2)

      repo.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('attaches visibilitychange/online listeners when document/window exist, and they poll immediately', async () => {
    vi.useFakeTimers()
    const listeners: Record<string, () => void> = {}
    const fakeDocument = {
      visibilityState: 'visible',
      addEventListener: vi.fn((eventName: string, cb: () => void) => {
        listeners[`document:${eventName}`] = cb
      }),
      removeEventListener: vi.fn(),
    }
    const fakeWindow = {
      addEventListener: vi.fn((eventName: string, cb: () => void) => {
        listeners[`window:${eventName}`] = cb
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('window', fakeWindow)
    try {
      const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, events: [], serverTime: 'x' }))
      const repo = new SheetsRepo({
        link: LINK,
        householdId: HID,
        outbox: new Outbox(memoryStore()),
        snapshot: new Snapshot(memoryStore()),
        fetch: fetchImpl,
        timers: { setTimeout, clearTimeout },
      })
      await repo.init()

      repo.start()
      expect(fakeDocument.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(fakeWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function))

      listeners['document:visibilitychange']?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchImpl).toHaveBeenCalledTimes(1)

      listeners['window:online']?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchImpl).toHaveBeenCalledTimes(2)

      repo.stop()
      expect(fakeDocument.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function))
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})

describe('SheetsRepo: upsertTask/upsertReward', () => {
  it('watchTasks and watchRewards fire synchronously, and an upsert with a newer updatedAt is queued and applied last-write-wins', async () => {
    const outbox = new Outbox(memoryStore())
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox,
      snapshot: new Snapshot(memoryStore()),
      // Always offline, so the background flush an upsert triggers never drains
      // the outbox out from under this test's assertions.
      fetch: vi.fn(async () => {
        throw new TypeError('offline')
      }),
    })
    await repo.init()

    const rewardsCb = vi.fn()
    repo.watchRewards(HID, rewardsCb)
    expect(rewardsCb).toHaveBeenCalledWith([])

    const first = task({ id: 'task-x', name: 'First', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertTask(HID, first)
    let seenTasks: TaskT[] = []
    repo.watchTasks(HID, (t) => (seenTasks = t))
    expect(seenTasks).toEqual([first])
    expect((await outbox.pending()).map((e) => e.payload.id)).toEqual([first.id])

    const newer = task({ id: 'task-x', name: 'Newer', updatedAt: new Date('2026-09-06T00:00:00.000Z') })
    await repo.upsertTask(HID, newer)
    repo.watchTasks(HID, (t) => (seenTasks = t))
    expect(seenTasks).toEqual([newer])

    const r = reward({ id: 'reward-x', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertReward(HID, r)
    let seenRewards: RewardT[] = []
    repo.watchRewards(HID, (rw) => (seenRewards = rw))
    expect(seenRewards).toEqual([r])

    const newerReward = reward({ id: 'reward-x', name: 'Newer', updatedAt: new Date('2026-09-06T00:00:00.000Z') })
    await repo.upsertReward(HID, newerReward)
    repo.watchRewards(HID, (rw) => (seenRewards = rw))
    expect(seenRewards).toEqual([newerReward])
  })

  it('rejects a stale updatedAt on upsertTask/upsertReward with a conflict, without enqueueing it', async () => {
    const outbox = new Outbox(memoryStore())
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox,
      snapshot: new Snapshot(memoryStore()),
      // Always offline, so the background flush appendEvent/upsert* trigger never
      // drains the outbox out from under this test's assertions.
      fetch: vi.fn(async () => {
        throw new TypeError('offline')
      }),
    })
    await repo.init()

    const current = task({ id: 'task-x', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertTask(HID, current)
    const stale = task({ id: 'task-x', name: 'Stale', updatedAt: new Date('2026-09-01T00:00:00.000Z') })
    await expect(repo.upsertTask(HID, stale)).rejects.toMatchObject({ code: 'conflict' })

    const currentReward = reward({ id: 'reward-x', updatedAt: new Date('2026-09-05T00:00:00.000Z') })
    await repo.upsertReward(HID, currentReward)
    const staleReward = reward({ id: 'reward-x', updatedAt: new Date('2026-09-01T00:00:00.000Z') })
    await expect(repo.upsertReward(HID, staleReward)).rejects.toMatchObject({ code: 'conflict' })

    const pending = (await outbox.pending()).map((e) => e.payload.id)
    expect(pending).toEqual([current.id, currentReward.id])
  })

  it('flushes tasks.upsert/rewards.upsert entries: confirms a success, retries a locked one, and drops an invalid one', async () => {
    let taskMode: 'ok' | 'locked' = 'ok'
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parsedBody(init)
      if (body.action === 'tasks.upsert')
        return taskMode === 'ok'
          ? jsonResponse({ ok: true, task: body.task })
          : jsonResponse({ ok: false, code: 'locked' })
      if (body.action === 'rewards.upsert') return jsonResponse({ ok: false, code: 'invalid' })
      if (body.action === 'events.since') return jsonResponse({ ok: true, events: [], serverTime: 'x' })
      throw new Error(`unexpected action: ${body.action}`)
    })
    const outbox = new Outbox(memoryStore())
    const t1 = task()
    const t2 = task()
    const r = reward()
    await outbox.enqueue('tasks.upsert', t1)
    await outbox.enqueue('rewards.upsert', r)

    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox,
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
    await repo.init()

    taskMode = 'ok'
    let result = await repo.sync()
    // t1 confirmed; reward dropped (invalid, final).
    expect((await outbox.pending()).map((e) => e.payload.id)).toEqual([])
    expect(result.dropped).toBe(1)

    await outbox.enqueue('tasks.upsert', t2)
    taskMode = 'locked'
    result = await repo.sync()
    expect(result.retryable).toBe(1)
    expect((await outbox.pending()).map((e) => e.payload.id)).toEqual([t2.id])
  })
})

describe('SheetsRepo: review fixes', () => {
  it("start()/stop() work with the default timers even when the environment's setTimeout/clearTimeout are receiver-checked, like a real browser's (issue #22)", () => {
    // A real browser's `window.setTimeout`/`clearTimeout` throw "Illegal
    // invocation" when called as a method of some other object (their `this`
    // must be the global) -- unlike Node's, which tolerate it, so this never
    // showed up under Vitest's `environment: 'node'` until the e2e suite hit
    // it in a real Chromium: `SheetsRepo`'s *default* `timers` destructured
    // `setTimeout`/`clearTimeout` off the global and stored them as plain
    // object properties, so calling `this.timers.setTimeout(...)` invoked
    // them detached from the global they need as their receiver.
    const realSetTimeout = globalThis.setTimeout
    const realClearTimeout = globalThis.clearTimeout
    function receiverCheckedSetTimeout(
      this: unknown,
      ...args: Parameters<typeof setTimeout>
    ): ReturnType<typeof setTimeout> {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return realSetTimeout(...args)
    }
    function receiverCheckedClearTimeout(this: unknown, ...args: Parameters<typeof clearTimeout>): void {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      realClearTimeout(...args)
    }
    vi.stubGlobal('setTimeout', receiverCheckedSetTimeout)
    vi.stubGlobal('clearTimeout', receiverCheckedClearTimeout)
    try {
      const repo = new SheetsRepo({
        link: LINK,
        householdId: HID,
        outbox: new Outbox(memoryStore()),
        snapshot: new Snapshot(memoryStore()),
        fetch: vi.fn(async () => jsonResponse({ ok: true, events: [], serverTime: 'x' })),
        // No `timers` override: this is exactly the default the constructor builds.
      })
      expect(() => repo.start()).not.toThrow()
      expect(() => repo.stop()).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('stop() during an in-flight tick prevents the tick from rescheduling itself', async () => {
    vi.useFakeTimers()
    try {
      let release: (() => void) | undefined
      const fetchImpl = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(jsonResponse({ ok: true, events: [], serverTime: 'x' }))
          }),
      )
      const repo = new SheetsRepo({
        link: LINK,
        householdId: HID,
        outbox: new Outbox(memoryStore()),
        snapshot: new Snapshot(memoryStore()),
        fetch: fetchImpl,
        timers: { setTimeout, clearTimeout },
      })
      await repo.init()
      repo.start()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)

      repo.stop()
      release?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(300_000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('an unauthorized answer keeps the outbox entry queued instead of dropping it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false, code: 'unauthorized' }))
    const outbox = new Outbox(memoryStore())
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox,
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
    await repo.init()
    await repo.appendEvent(HID, complete(task()))
    await settle()
    const result = await repo.sync()
    expect(result.retryable).toBe(1)
    expect(result.dropped).toBe(0)
    expect((await outbox.pending()).length).toBe(1)
  })

  it('connect() adopts the link it validated, so later syncs use it', async () => {
    const other: SetupLink = { url: 'https://script.google.com/macros/s/other/exec', secret: 'y'.repeat(12) }
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url))
      const body = parsedBody(init)
      if (body.action === 'bootstrap') {
        return jsonResponse({
          ok: true,
          household: {
            v: 1,
            id: HID,
            name: 'Home',
            weeklyTarget: 250,
            tz: 'Europe/Vilnius',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
          members: [{ uid: ANA, name: 'Ana', color: '#128369', role: 'adult' }],
          tasks: [],
          rewards: [],
          events: [],
          serverTime: 'x',
        })
      }
      return jsonResponse({ ok: true, events: [], serverTime: 'x' })
    })
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
    await repo.connect(other)
    await repo.sync()
    expect(urls.every((u) => u === other.url)).toBe(true)
  })
})

describe('SheetsRepo: version', () => {
  it('asks the script for its version and returns the string', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(parsedBody(init).action).toBe('version')
      return jsonResponse({ ok: true, version: '1.2.0' })
    })
    const repo = new SheetsRepo({
      link: LINK,
      householdId: HID,
      outbox: new Outbox(memoryStore()),
      snapshot: new Snapshot(memoryStore()),
      fetch: fetchImpl,
    })
    await expect(repo.version()).resolves.toBe('1.2.0')
  })
})

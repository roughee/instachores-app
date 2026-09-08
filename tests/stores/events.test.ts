import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepo } from '@/data/memoryRepo'
import { deriveState } from '@/domain/derive'
import { SEED_IDS } from '@/domain/seed'
import { DAY_MS, startOfWeek } from '@/domain/time'
import { ChoreEvent } from '@/schemas'
import { configureSession, useSessionStore } from '@/stores/session'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { ANA, BEN, HID, NOW, TZ, household, task } from '../helpers/fixtures'
import { idCounter } from '../helpers/testRepo'

function unused(): never {
  throw new Error('not used in this test file')
}

/**
 * `MemoryRepo.appendEvent` has no internal `await`, so its own watchers fire
 * synchronously too, which would let a store that never applies optimistically
 * still pass a naive "changed before the promise resolves" check. This repo
 * adds a real tick of latency before the write lands, the way `SheetsRepo`
 * does (it awaits `init`, the outbox and the snapshot before notifying), so
 * the test below only passes if the store applies the event to its own
 * state itself rather than leaning on the repo's watcher.
 */
class SlowRepo extends MemoryRepo {
  override async appendEvent(id: string, e: Parameters<MemoryRepo['appendEvent']>[1]): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    return super.appendEvent(id, e)
  }
}

/** Binds household, catalog and events the way `sessionStore.bindRepo` would. */
function bindAll(repo: MemoryRepo, opts: { tz?: string } = {}) {
  const householdStore = useHouseholdStore()
  const catalogStore = useCatalogStore()
  const eventsStore = useEventsStore()
  householdStore.bind(repo, HID)
  catalogStore.bind(repo, HID)
  eventsStore.bind(repo, HID, { tz: opts.tz ?? TZ, now: () => clock })
  return { householdStore, catalogStore, eventsStore }
}

let clock = NOW

beforeEach(() => {
  setActivePinia(createPinia())
  clock = NOW
  configureSession({
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    createSheetsRepo: unused,
    createDemoRepo: unused,
    now: () => clock,
    ids: idCounter('ev'),
  })
})

describe('eventsStore.complete', () => {
  it('appends exactly one complete event that passes the schema, credited to the current member for the task’s current points', async () => {
    const pots = task({ id: 'task-pots', points: 4 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')

    const completes = eventsStore.events.filter((e) => e.type === 'complete')
    expect(completes).toHaveLength(1)
    const ev = completes[0]!
    expect(ChoreEvent.safeParse(ev).success).toBe(true)
    expect(ev.forUid).toBe(ANA)
    expect(ev.points).toBe(4)
    expect(ev.taskId).toBe('task-pots')
  })

  it('changes the derived household total synchronously, before the repo promise it returns resolves', () => {
    const pots = task({ id: 'task-pots', points: 4 })
    // A repo with real write latency: if the store leaned on the repo's own
    // watcher to reflect the change, this would still read 0 here.
    const repo = new SlowRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    expect(eventsStore.derived.week.household).toBe(0)
    const pending = eventsStore.complete('task-pots')
    // No `await` yet: the repo promise is still pending (its `setTimeout`
    // hasn't fired), but the optimistic apply already ran in this tick.
    expect(eventsStore.derived.week.household).toBe(4)
    expect(eventsStore.derived.balances[ANA]).toBe(4)
    return pending
  })

  it('defaults forUid to opts.forUid when given, crediting someone other than the actor', async () => {
    const pots = task({ id: 'task-pots', points: 3 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots', { forUid: BEN })

    const ev = eventsStore.events.find((e) => e.type === 'complete')
    expect(ev?.actorUid).toBe(ANA)
    expect(ev?.forUid).toBe(BEN)
  })

  it('rejects an unknown task id', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA
    await expect(eventsStore.complete('nope')).rejects.toThrow()
  })
})

describe('eventsStore.undo', () => {
  it('within the 4s window appends an undo event referencing the original', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!

    clock = new Date(NOW.getTime() + 1000)
    const result = eventsStore.undo(original.id)

    expect(result).toEqual({ ok: true })
    const undoEvent = eventsStore.events.find((e) => e.type === 'undo')
    expect(undoEvent?.refEventId).toBe(original.id)
    expect(eventsStore.derived.week.household).toBe(0)
  })

  it('after the window is a no-op and says so', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!

    clock = new Date(NOW.getTime() + 4001)
    const result = eventsStore.undo(original.id)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toEqual(expect.any(String))
    expect(eventsStore.events.some((e) => e.type === 'undo')).toBe(false)
    expect(eventsStore.derived.week.household).toBe(2)
  })

  it('undoing an event id with no open undo window is a no-op', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA
    const result = eventsStore.undo('ev-never-logged')
    expect(result.ok).toBe(false)
  })
})

describe('eventsStore.derived', () => {
  it('is exactly domain.deriveState’s output for the current events/tasks/rewards/household/now, not re-computed in the store', () => {
    const pots = task({ id: 'task-pots', points: 4 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore, catalogStore, householdStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    const expected = deriveState({
      events: eventsStore.events,
      tasks: catalogStore.tasks,
      rewards: catalogStore.rewards,
      household: householdStore.household!,
      now: clock,
    })

    expect(eventsStore.derived.balances).toEqual(expected.balances)
    expect(eventsStore.derived.week).toEqual(expected.week)
    expect(eventsStore.derived.quickRow).toEqual(expected.quickRow)
    expect(eventsStore.derived.heatStrip).toEqual(expected.heatStrip)
  })

  it('is a safe all-zero shape before a household has loaded', () => {
    const eventsStore = useEventsStore()
    expect(eventsStore.derived.balances).toEqual({})
    expect(eventsStore.derived.week.household).toBe(0)
    expect(eventsStore.derived.quickRow).toEqual([])
    expect(eventsStore.derived.dueDots.kitchen).toBe(false)
  })

  it('ticks the clock every 60s so week/month boundaries roll over without a re-bind', () => {
    vi.useFakeTimers()
    try {
      const repo = new MemoryRepo([{ id: HID, household: household() }])
      const eventsStore = useEventsStore()
      const now = vi.fn(() => NOW)
      eventsStore.bind(repo, HID, { tz: TZ, now })
      expect(now).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(60_000)
      expect(now).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('combo detection after complete', () => {
  it('emits the Kitchen Reset bonus exactly once, once every group task is done the same day', async () => {
    const tasks = [
      task({ id: SEED_IDS.pots, category: 'kitchen', points: 2 }),
      task({ id: SEED_IDS.counters, category: 'kitchen', points: 3 }),
      task({ id: SEED_IDS.trash, category: 'kitchen', points: 2 }),
      task({ id: SEED_IDS.dishwasherLoad, category: 'kitchen', points: 2 }),
    ]
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete(SEED_IDS.pots)
    await eventsStore.complete(SEED_IDS.counters)
    await eventsStore.complete(SEED_IDS.trash)
    expect(eventsStore.events.filter((e) => e.type === 'bonus')).toHaveLength(0)

    await eventsStore.complete(SEED_IDS.dishwasherLoad)
    const bonuses = eventsStore.events.filter((e) => e.type === 'bonus' && e.combo === 'kitchen-reset')
    expect(bonuses).toHaveLength(1)

    // Completing another group task the same day must not award it a second time.
    await eventsStore.complete(SEED_IDS.trash)
    const bonusesAfter = eventsStore.events.filter((e) => e.type === 'bonus' && e.combo === 'kitchen-reset')
    expect(bonusesAfter).toHaveLength(1)
  })
})

describe('editing a task does not rewrite history', () => {
  it('updateTaskPoints through the catalog store leaves an already-logged complete event’s points unchanged', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore, catalogStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const before = eventsStore.events.find((e) => e.type === 'complete')!
    expect(before.points).toBe(2)

    await catalogStore.updateTaskPoints('task-pots', 10, ANA)

    const after = eventsStore.events.find((e): e is typeof before => e.id === before.id && e.type === 'complete')!
    expect(after.points).toBe(2)
    expect(eventsStore.derived.balances[ANA]).toBe(2)
  })
})

describe('eventsStore.weekRollup / week navigation (issue #19)', () => {
  it('defaults to the current week, pro-rated to now', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const { eventsStore } = bindAll(repo)

    expect(eventsStore.weekOffset).toBe(0)
    // NOW is Wednesday (fixtures.ts): 3 days into the week.
    expect(eventsStore.weekRollup.elapsedDays).toBe(3)
    expect(eventsStore.weekRollup.start.toISOString()).toBe(startOfWeek(NOW, TZ).toISOString())
  })

  it('prevWeek steps back and shows that week’s events; nextWeek never passes the current week', async () => {
    const pots = task({ id: 'task-pots', points: 3 })
    const weekStart = startOfWeek(NOW, TZ)
    const lastWeekStart = startOfWeek(new Date(weekStart.getTime() - DAY_MS), TZ)
    const lastWeekEvent = ChoreEvent.parse({
      v: 1,
      id: 'ev-last-week',
      type: 'complete',
      actorUid: ANA,
      at: new Date(lastWeekStart.getTime() + DAY_MS),
      loggedAt: new Date(lastWeekStart.getTime() + DAY_MS),
      taskId: 'task-pots',
      forUid: ANA,
      points: 3,
    })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots], events: [lastWeekEvent] }])
    const { eventsStore } = bindAll(repo)

    expect(eventsStore.weekRollup.household).toBe(0)

    eventsStore.prevWeek()
    expect(eventsStore.weekOffset).toBe(-1)
    expect(eventsStore.weekRollup.household).toBe(3)

    eventsStore.nextWeek()
    eventsStore.nextWeek()
    expect(eventsStore.weekOffset).toBe(0)
    expect(eventsStore.weekRollup.household).toBe(0)
  })

  it('is a safe all-zero shape before a household has loaded', () => {
    const eventsStore = useEventsStore()
    expect(eventsStore.weekRollup.household).toBe(0)
    expect(eventsStore.weekRollup.target).toBe(0)
    expect(eventsStore.weekRollup.byCategory).toEqual({})
  })
})

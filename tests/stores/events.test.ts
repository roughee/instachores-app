import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepo } from '@/data/memoryRepo'
import { deriveState } from '@/domain/derive'
import { SEED_IDS } from '@/domain/seed'
import { completes, liveEvents } from '@/domain/events'
import { deriveSchedule, dueDayFor } from '@/domain/schedule'
import { DAY_MS, dayKey, startOfWeek } from '@/domain/time'
import { ChoreEvent } from '@/schemas'
import { configureSession, useSessionStore } from '@/stores/session'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { ANA, BEN, HID, MIA, NOW, TZ, household, task } from '../helpers/fixtures'
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

describe('eventsStore.youToday', () => {
  it('sums today’s complete points credited to the current member, adult tasks only', async () => {
    const pots = task({ id: 'task-pots', points: 4 })
    const kidTask = task({ id: 'task-kid', points: 2, forRole: 'kid', category: 'kid' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots, kidTask] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    await eventsStore.complete('task-kid', { forUid: MIA })

    expect(eventsStore.youToday).toBe(4)
  })

  it('does not count a completion credited to someone else', async () => {
    const pots = task({ id: 'task-pots', points: 3 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots', { forUid: BEN })

    expect(eventsStore.youToday).toBe(0)
  })

  it('does not count a completion logged on an earlier day', async () => {
    const pots = task({ id: 'task-pots', points: 3 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots', { at: new Date(NOW.getTime() - DAY_MS) })

    expect(eventsStore.youToday).toBe(0)
  })

  it('ignores an event undone within its window', async () => {
    const pots = task({ id: 'task-pots', points: 3 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!
    eventsStore.undo(original.id)

    expect(eventsStore.youToday).toBe(0)
  })

  it('is 0 before a household has loaded', () => {
    const eventsStore = useEventsStore()
    expect(eventsStore.youToday).toBe(0)
  })
})

describe('eventsStore.doneTodayByTask', () => {
  it('lists the forUid of each of today’s completions for a task, one entry per event', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    await eventsStore.complete('task-pots', { forUid: BEN })

    expect(eventsStore.doneTodayByTask.get('task-pots')).toEqual([ANA, BEN])
  })

  it('excludes a completion undone within its window', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!
    eventsStore.undo(original.id)

    expect(eventsStore.doneTodayByTask.get('task-pots')).toBeUndefined()
  })

  it('excludes a completion from an earlier day', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots', { at: new Date(NOW.getTime() - DAY_MS) })

    expect(eventsStore.doneTodayByTask.get('task-pots')).toBeUndefined()
  })

  it('is empty before a household has loaded', () => {
    const eventsStore = useEventsStore()
    expect(eventsStore.doneTodayByTask.size).toBe(0)
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

describe('eventsStore.completeMany', () => {
  function bathroomGroup() {
    return [
      task({ id: SEED_IDS.cleanBathroom, name: 'Clean bathroom', category: 'bathroom', points: 0, comboBonus: 2 }),
      task({
        id: SEED_IDS.toilet,
        name: 'Toilet',
        category: 'bathroom',
        points: 4,
        parentId: SEED_IDS.cleanBathroom,
      }),
      task({
        id: SEED_IDS.bathSink,
        name: 'Sink + mirror + counter',
        category: 'bathroom',
        points: 2,
        parentId: SEED_IDS.cleanBathroom,
      }),
      task({
        id: SEED_IDS.shower,
        name: 'Shower / tub',
        category: 'bathroom',
        points: 4,
        parentId: SEED_IDS.cleanBathroom,
      }),
      task({
        id: SEED_IDS.drain,
        name: 'Clear shower drain',
        category: 'bathroom',
        points: 4,
        parentId: SEED_IDS.cleanBathroom,
      }),
    ]
  }

  it('completes every sub-item in order, then appends exactly one bonus with the deterministic combo id', async () => {
    const tasks = bathroomGroup()
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.completeMany([SEED_IDS.toilet, SEED_IDS.bathSink, SEED_IDS.shower, SEED_IDS.drain])

    const completes = eventsStore.events.filter((e) => e.type === 'complete')
    expect(completes.map((e) => e.taskId)).toEqual([
      SEED_IDS.toilet,
      SEED_IDS.bathSink,
      SEED_IDS.shower,
      SEED_IDS.drain,
    ])

    const bonuses = eventsStore.events.filter((e) => e.type === 'bonus')
    expect(bonuses).toHaveLength(1)
    expect(bonuses[0]?.combo).toBe(SEED_IDS.cleanBathroom)
    expect(bonuses[0]?.points).toBe(2)
  })

  it('points recentlyLogged at the last complete, not the bonus, so Undo removes the last sub-item', async () => {
    const tasks = bathroomGroup()
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.completeMany([SEED_IDS.toilet, SEED_IDS.bathSink, SEED_IDS.shower, SEED_IDS.drain])

    const lastComplete = eventsStore.events.filter((e) => e.type === 'complete').at(-1)!
    expect(eventsStore.recentlyLogged?.eventId).toBe(lastComplete.id)
  })

  it('running completeMany a second time does not append a second bonus', async () => {
    const tasks = bathroomGroup()
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.completeMany([SEED_IDS.toilet, SEED_IDS.bathSink, SEED_IDS.shower, SEED_IDS.drain])
    await eventsStore.completeMany([SEED_IDS.toilet, SEED_IDS.bathSink, SEED_IDS.shower, SEED_IDS.drain])

    const bonuses = eventsStore.events.filter((e) => e.type === 'bonus')
    expect(bonuses).toHaveLength(1)
    const completes = eventsStore.events.filter((e) => e.type === 'complete')
    expect(completes).toHaveLength(8)
  })
})

describe('eventsStore.todayRows / todayTotals (#18)', () => {
  it('exposes today’s completes newest-first, with an undone row struck through and excluded from totals', async () => {
    const pots = task({ id: 'task-pots', points: 4 })
    const laundry = task({ id: 'task-fold', points: 3 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots, laundry] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const potsEvent = eventsStore.events.find((e) => e.type === 'complete')!

    clock = new Date(NOW.getTime() + 1000)
    eventsStore.undo(potsEvent.id)

    clock = new Date(NOW.getTime() + 60_000)
    await eventsStore.complete('task-fold', { forUid: BEN })

    expect(eventsStore.todayRows.map((r) => r.taskId)).toEqual(['task-fold', 'task-pots'])
    const potsRow = eventsStore.todayRows.find((r) => r.taskId === 'task-pots')!
    expect(potsRow.undone).toBe(true)
    expect(eventsStore.todayTotals.household).toBe(3)
    expect(eventsStore.todayTotals.byMember[ANA]).toBeUndefined()
    expect(eventsStore.todayTotals.byMember[BEN]).toBe(3)
  })

  it('groups by the household timezone’s hour, not UTC (Vilnius fixture)', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots') // NOW is 21:00 Vilnius

    expect(eventsStore.todayRows[0]!.hourKey).toBe('21')
  })

  it('todayTotals.household equals the sum of today’s live complete points from the domain layer, not re-derived here', async () => {
    const pots = task({ id: 'task-pots', points: 4 })
    const laundry = task({ id: 'task-fold', points: 3 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots, laundry] }])
    const { eventsStore, householdStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    clock = new Date(NOW.getTime() + 60_000)
    await eventsStore.complete('task-fold', { forUid: BEN })

    const tz = householdStore.household!.tz
    const today = dayKey(clock, tz)
    const expected = completes(liveEvents(eventsStore.events))
      .filter((e) => dayKey(e.at, tz) === today)
      .reduce((sum, e) => sum + e.points, 0)

    expect(eventsStore.todayTotals.household).toBe(expected)
  })

  it('is empty before a household has loaded', () => {
    const eventsStore = useEventsStore()
    expect(eventsStore.todayRows).toEqual([])
    expect(eventsStore.todayTotals).toEqual({ household: 0, byMember: {} })
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

describe('eventsStore.schedule (issue #68)', () => {
  it('is empty before a household has loaded', () => {
    const eventsStore = useEventsStore()
    expect(eventsStore.schedule.size).toBe(0)
  })

  it('is exactly domain.deriveSchedule’s output for the current events/tasks/household/now', async () => {
    const pots = task({ id: 'task-pots', points: 4, freq: 'weekly' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore, catalogStore, householdStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')

    const expected = deriveSchedule({
      events: eventsStore.events,
      tasks: catalogStore.tasks,
      household: householdStore.household!,
      now: clock,
    })
    expect(eventsStore.schedule).toEqual(expected)
  })
})

describe('eventsStore.scheduleNext (issue #68)', () => {
  it('appends one schedule event referencing the complete, with the right shape', async () => {
    const pots = task({ id: 'task-pots', points: 4, freq: 'weekly' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!

    await eventsStore.scheduleNext(original.id, 7)

    const scheds = eventsStore.events.filter((e) => e.type === 'schedule')
    expect(scheds).toHaveLength(1)
    const sched = scheds[0]!
    expect(ChoreEvent.safeParse(sched).success).toBe(true)
    expect(sched.taskId).toBe('task-pots')
    expect(sched.refEventId).toBe(original.id)
    expect(sched.days).toBe(7)
    expect(sched.dueAt).toEqual(dueDayFor(original.at, 7, TZ))
    expect(sched.actorUid).toBe(ANA)
  })

  it('turns the task away in derived.schedule', async () => {
    const pots = task({ id: 'task-pots', points: 4, freq: 'weekly' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!
    await eventsStore.scheduleNext(original.id, 7)

    expect(eventsStore.schedule.get('task-pots')?.state).toBe('away')
  })

  it('excludes the away task from quickRow', async () => {
    const t = task({ id: 'task-x', points: 2, freq: 'adhoc' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [t] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-x')
    expect(eventsStore.derived.quickRow.some((x) => x.id === 'task-x')).toBe(true)

    const original = eventsStore.events.find((e) => e.type === 'complete')!
    await eventsStore.scheduleNext(original.id, 30)

    expect(eventsStore.derived.quickRow.some((x) => x.id === 'task-x')).toBe(false)
  })

  it('excludes the away task’s category from dueDots', async () => {
    const vacuum = task({ id: 'task-vacuum', points: 5, freq: 'weekly', category: 'floors' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [vacuum] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-vacuum', { at: new Date(NOW.getTime() - 20 * DAY_MS) })
    expect(eventsStore.derived.dueDots.floors).toBe(true)

    const original = eventsStore.events.find((e) => e.type === 'complete')!
    await eventsStore.scheduleNext(original.id, 30)

    expect(eventsStore.derived.dueDots.floors).toBe(false)
  })

  it('is a no-op when the complete event does not exist', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.scheduleNext('ev-never-logged', 5)

    expect(eventsStore.events).toHaveLength(0)
  })

  it('is a no-op when the referenced complete has already been undone', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!
    clock = new Date(NOW.getTime() + 1000)
    eventsStore.undo(original.id)

    await eventsStore.scheduleNext(original.id, 5)

    expect(eventsStore.events.some((e) => e.type === 'schedule')).toBe(false)
  })
})

describe('eventsStore.unschedule (issue #68)', () => {
  it('appends an unschedule event referencing the effective schedule and returns the task to listed', async () => {
    const pots = task({ id: 'task-pots', points: 2, freq: 'weekly' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!
    await eventsStore.scheduleNext(original.id, 7)
    const sched = eventsStore.events.find((e) => e.type === 'schedule')!
    expect(eventsStore.schedule.get('task-pots')?.state).toBe('away')

    await eventsStore.unschedule('task-pots')

    const unsched = eventsStore.events.find((e) => e.type === 'unschedule')
    expect(unsched).toBeDefined()
    expect(ChoreEvent.safeParse(unsched).success).toBe(true)
    expect(unsched?.refEventId).toBe(sched.id)
    expect(eventsStore.schedule.get('task-pots')?.state).toBe('listed')
  })

  it('is a no-op when the task has no effective schedule', async () => {
    const pots = task({ id: 'task-pots', points: 2 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.unschedule('task-pots')

    expect(eventsStore.events).toHaveLength(0)
  })
})

describe('eventsStore.undo dropping a schedule (issue #68)', () => {
  it('undoing the referenced complete within its window returns the task to listed', async () => {
    const pots = task({ id: 'task-pots', points: 2, freq: 'weekly' })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    const { eventsStore } = bindAll(repo)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-pots')
    const original = eventsStore.events.find((e) => e.type === 'complete')!
    await eventsStore.scheduleNext(original.id, 7)
    expect(eventsStore.schedule.get('task-pots')?.state).toBe('away')

    clock = new Date(NOW.getTime() + 1000)
    eventsStore.undo(original.id)

    expect(eventsStore.schedule.get('task-pots')?.state).toBe('listed')
  })
})

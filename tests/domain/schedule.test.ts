import { describe, expect, it } from 'vitest'
import { deriveSchedule, dueDayFor, isDue, suggestedIntervalDays, windowDays } from '@/domain/schedule'
import { SEED_IDS, seedTasks } from '@/domain/seed'
import { ANA, BEN, MIA, NOW, TZ, complete, event, household, task } from '../helpers/fixtures'

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('schedule', () => {
  it('maps each frequency to a window in days, and adhoc to none', () => {
    expect(windowDays('daily')).toBe(1)
    expect(windowDays('weekly')).toBe(7)
    expect(windowDays('biweekly')).toBe(14)
    expect(windowDays('monthly')).toBe(30)
    expect(windowDays('quarterly')).toBe(90)
    expect(windowDays('adhoc')).toBeNull()
  })

  it('a task is due once its window has passed since the last completion', () => {
    const weekly = task({ freq: 'weekly' })
    expect(isDue(weekly, daysAgo(8), NOW)).toBe(true)
    expect(isDue(weekly, daysAgo(6), NOW)).toBe(false)
  })

  it('a task that was never done is not nagged about', () => {
    expect(isDue(task({ freq: 'daily' }), undefined, NOW)).toBe(false)
  })

  it('adhoc and archived tasks are never due', () => {
    expect(isDue(task({ freq: 'adhoc' }), daysAgo(400), NOW)).toBe(false)
    expect(isDue(task({ freq: 'daily', archived: true }), daysAgo(3), NOW)).toBe(false)
  })
})

describe('suggestedIntervalDays', () => {
  it("is the task's own intervalDays when set", () => {
    expect(suggestedIntervalDays(task({ freq: 'weekly', intervalDays: 3 }))).toBe(3)
  })

  it('falls back to a default window per freq when intervalDays is unset', () => {
    expect(suggestedIntervalDays(task({ freq: 'daily' }))).toBe(1)
    expect(suggestedIntervalDays(task({ freq: 'weekly' }))).toBe(7)
    expect(suggestedIntervalDays(task({ freq: 'biweekly' }))).toBe(14)
    expect(suggestedIntervalDays(task({ freq: 'monthly' }))).toBe(30)
    expect(suggestedIntervalDays(task({ freq: 'quarterly' }))).toBe(90)
  })

  it('is undefined for an adhoc task with no intervalDays', () => {
    expect(suggestedIntervalDays(task({ freq: 'adhoc' }))).toBeUndefined()
  })
})

describe('seed intervalDays overrides (Plan §5.5)', () => {
  const tasks = seedTasks(NOW, ANA)
  const byId = (id: string) => tasks.find((t) => t.id === id)!

  it('sets the interval the "Next time?" sheet should preselect for these tasks', () => {
    expect(byId(SEED_IDS.cleanBathroom).intervalDays).toBe(7)
    expect(byId(SEED_IDS.vacuumAll).intervalDays).toBe(3)
    expect(byId(SEED_IDS.vacuumRoom).intervalDays).toBe(1)
    expect(byId(SEED_IDS.mop).intervalDays).toBe(5)
    expect(byId(SEED_IDS.fridge).intervalDays).toBe(14)
  })
})

describe('dueDayFor', () => {
  it("is household-local midnight N days after the completion's local day", () => {
    // NOW is Wed 2026-09-09 21:00 Vilnius; +7 days is Wed 2026-09-16 00:00 local.
    expect(dueDayFor(NOW, 7, TZ).toISOString()).toBe('2026-09-15T21:00:00.000Z')
  })

  it('holds across the October DST change in Vilnius (#66)', () => {
    // 2026-10-23T10:00Z is 13:00 EEST (+3) in Vilnius: still Oct 23 local.
    // +3 days -> Oct 26, whose local midnight falls after the clocks moved back to EET (+2).
    const completedAt = new Date('2026-10-23T10:00:00.000Z')
    expect(dueDayFor(completedAt, 3, TZ).toISOString()).toBe('2026-10-25T22:00:00.000Z')
  })
})

describe('deriveSchedule', () => {
  const h = household()

  it('every task in `tasks` gets an entry; with no events it is listed', () => {
    const t = task({ freq: 'weekly' })
    const map = deriveSchedule({ events: [], tasks: [t], household: h, now: NOW })
    expect(map.size).toBe(1)
    expect(map.get(t.id)).toEqual({ taskId: t.id, state: 'listed' })
  })

  it('records lastDoneAt/lastDoneBy from the latest live complete even with no schedule', () => {
    const t = task({ freq: 'weekly' })
    const at = new Date('2026-09-05T18:00:00.000Z')
    const c = complete(t, { forUid: BEN, at, loggedAt: at })
    const s = deriveSchedule({ events: [c], tasks: [t], household: h, now: NOW }).get(t.id)!
    expect(s.state).toBe('listed')
    expect(s.lastDoneAt).toEqual(at)
    expect(s.lastDoneBy).toBe(BEN)
  })

  it('a scheduled task is away until its due day, then due, and stays due once overdue', () => {
    const t = task({ freq: 'weekly' })
    const c = complete(t, { forUid: ANA })
    const dueAt = dueDayFor(c.at, 7, TZ)
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 7 })
    const input = (now: Date) => deriveSchedule({ events: [c, sched], tasks: [t], household: h, now })

    expect(input(NOW).get(t.id)).toMatchObject({ state: 'away', dueAt, days: 7, scheduleEventId: sched.id })
    expect(input(dueAt).get(t.id)!.state).toBe('due')
    expect(input(new Date(dueAt.getTime() + 30 * 86_400_000)).get(t.id)!.state).toBe('due')
  })

  it('undo of the referenced complete drops the schedule (#66)', () => {
    const t = task({ freq: 'weekly' })
    const c = complete(t, { forUid: ANA })
    const dueAt = dueDayFor(c.at, 7, TZ)
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 7 })
    const undo = event('undo', { refEventId: c.id })
    const s = deriveSchedule({ events: [c, sched, undo], tasks: [t], household: h, now: NOW }).get(t.id)!
    expect(s).toEqual({ taskId: t.id, state: 'listed' })
  })

  it('a later complete for the same task supersedes an older schedule (#66)', () => {
    const t = task({ freq: 'weekly' })
    const at1 = new Date('2026-09-01T18:00:00.000Z')
    const c1 = complete(t, { forUid: ANA, at: at1, loggedAt: at1 })
    const dueAt = dueDayFor(c1.at, 7, TZ)
    const sched = event('schedule', { taskId: t.id, refEventId: c1.id, dueAt, days: 7, at: at1 })
    const at2 = new Date('2026-09-05T18:00:00.000Z')
    const c2 = complete(t, { forUid: BEN, at: at2, loggedAt: at2 })
    const s = deriveSchedule({ events: [c1, sched, c2], tasks: [t], household: h, now: NOW }).get(t.id)!
    expect(s.state).toBe('listed')
    expect(s.dueAt).toBeUndefined()
    expect(s.lastDoneAt).toEqual(at2)
    expect(s.lastDoneBy).toBe(BEN)
  })

  it('unschedule returns the task to listed without touching lastDoneAt (#66)', () => {
    const t = task({ freq: 'weekly' })
    const c = complete(t, { forUid: ANA })
    const dueAt = dueDayFor(c.at, 7, TZ)
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 7 })
    const unsched = event('unschedule', { refEventId: sched.id })
    const s = deriveSchedule({ events: [c, sched, unsched], tasks: [t], household: h, now: NOW }).get(t.id)!
    expect(s.state).toBe('listed')
    expect(s.dueAt).toBeUndefined()
    expect(s.lastDoneAt).toEqual(c.at)
  })

  it('kid tasks skip the schedule rules entirely, staying listed', () => {
    const t = task({ freq: 'weekly', forRole: 'kid' })
    const c = complete(t, { forUid: MIA, points: 1 })
    const dueAt = dueDayFor(c.at, 7, TZ)
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 7 })
    const s = deriveSchedule({ events: [c, sched], tasks: [t], household: h, now: NOW }).get(t.id)!
    expect(s).toEqual({ taskId: t.id, state: 'listed' })
  })

  it('ignores events for a task id that is not in the given tasks', () => {
    const t = task({ freq: 'weekly' })
    const ghost = event('complete', { taskId: 'task-ghost', forUid: ANA, points: 2 })
    const map = deriveSchedule({ events: [ghost], tasks: [t], household: h, now: NOW })
    expect(map.size).toBe(1)
    expect(map.get(t.id)).toEqual({ taskId: t.id, state: 'listed' })
  })

  it('the due boundary is the household local midnight, holding across the October DST change (#66)', () => {
    const t = task({ freq: 'weekly' })
    const completedAt = new Date('2026-10-18T18:00:00.000Z')
    const c = complete(t, { forUid: ANA, at: completedAt, loggedAt: completedAt })
    // +7 days lands on 2026-10-25, the day Vilnius itself moves from EEST to EET.
    const dueAt = dueDayFor(completedAt, 7, TZ)
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 7, at: completedAt })
    const input = (now: Date) => deriveSchedule({ events: [c, sched], tasks: [t], household: h, now })

    expect(input(new Date(dueAt.getTime() - 1000)).get(t.id)!.state).toBe('away')
    expect(input(dueAt).get(t.id)!.state).toBe('due')
  })
})

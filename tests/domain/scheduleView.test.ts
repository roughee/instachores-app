/**
 * `buildScheduleView` (issue #71, Plan §5.5 `#/schedule`): the pure grouping
 * and copy behind the Schedule tab. Domain layer, so every branch here needs
 * a test (Plan §7.5's 100% line/function gate on `src/domain/`).
 */
import { describe, expect, it } from 'vitest'
import { buildScheduleView } from '@/domain/scheduleView'
import { deriveSchedule, dueDayFor } from '@/domain/schedule'
import type { TaskSchedule } from '@/domain/schedule'
import { dayKey } from '@/domain/time'
import type { ChoreEvent, Household, Task } from '@/schemas'
import { ANA, BEN, MIA, NOW, TZ, complete, event, household, task } from '../helpers/fixtures'

const DAY_MS = 86_400_000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS)

const HH = household()

function buildFor(tasks: Task[], events: ChoreEvent[], now: Date = NOW, hh: Household = HH) {
  const schedule = deriveSchedule({ events, tasks, household: hh, now })
  return buildScheduleView({ schedule, events, tasks, household: hh, now })
}

describe('buildScheduleView: empty cases', () => {
  it('is empty groups and empty recent with nothing scheduled and nothing done', () => {
    const view = buildFor([], [])
    expect(view).toEqual({ groups: [], recent: [] })
  })

  it('stays empty when tasks exist but none have ever been completed or scheduled', () => {
    const t = task({ freq: 'weekly' })
    const view = buildFor([t], [])
    expect(view).toEqual({ groups: [], recent: [] })
  })
})

describe('buildScheduleView: Upcoming grouping boundaries (household-local midnight)', () => {
  it('groups a task due today under Today, with the Due chip', () => {
    const t = task({ id: 'mop', name: 'Wet-mop floors', category: 'floors', freq: 'weekly', points: 5 })
    const c = complete(t, { forUid: ANA, at: daysAgo(5) })
    const dueAt = dueDayFor(c.at, 5, TZ)
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 5 })
    const view = buildFor([t], [c, sched])

    expect(view.groups.map((g) => g.key)).toEqual(['today'])
    expect(view.groups[0]!.label).toBe('Today')
    expect(view.groups[0]!.rows).toEqual([
      {
        taskId: t.id,
        name: 'Wet-mop floors',
        category: 'floors',
        points: 5,
        subline: '5 days ago · Ana',
        dueAt,
        chipLabel: 'Due',
        chipVariant: 'due',
      },
    ])
  })

  it('keeps an overdue task under Today rather than a separate group', () => {
    const t = task({ id: 'mop', freq: 'weekly', points: 5 })
    const c = complete(t, { forUid: ANA, at: daysAgo(9) })
    const dueAt = dueDayFor(c.at, 5, TZ) // due 4 days ago
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 5 })
    const view = buildFor([t], [c, sched])

    expect(view.groups).toHaveLength(1)
    expect(view.groups[0]!.key).toBe('today')
    expect(view.groups[0]!.rows[0]!.chipLabel).toBe('Due')
  })

  it('groups a task due tomorrow under Tomorrow, with the plain weekday chip', () => {
    const t = task({ id: 'vacuum', freq: 'adhoc', points: 2 })
    const c = complete(t, { forUid: BEN })
    const dueAt = dueDayFor(c.at, 1, TZ) // NOW is Wed 2026-09-09 local; +1 day is Thu.
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 1 })
    const view = buildFor([t], [c, sched])

    expect(view.groups.map((g) => g.key)).toEqual(['tomorrow'])
    expect(view.groups[0]!.label).toBe('Tomorrow')
    expect(view.groups[0]!.rows[0]).toMatchObject({ chipLabel: 'Thu', chipVariant: 'day' })
  })

  it('groups a task due 2 days out under This week (the lower boundary)', () => {
    const t = task({ id: 'stove', freq: 'weekly', points: 3 })
    const c = complete(t, { forUid: BEN })
    const dueAt = dueDayFor(c.at, 2, TZ) // +2 days is Fri 2026-09-11.
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 2 })
    const view = buildFor([t], [c, sched])

    expect(view.groups.map((g) => g.key)).toEqual(['week'])
    expect(view.groups[0]!.label).toBe('This week')
    expect(view.groups[0]!.rows[0]).toMatchObject({ chipLabel: 'Fri 11', chipVariant: 'day' })
  })

  it('groups a task due 8 days out under This week (the upper boundary)', () => {
    const t = task({ id: 'stove', freq: 'weekly', points: 3 })
    const c = complete(t, { forUid: BEN })
    const dueAt = dueDayFor(c.at, 8, TZ) // +8 days is Thu 2026-09-17.
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 8 })
    const view = buildFor([t], [c, sched])

    expect(view.groups.map((g) => g.key)).toEqual(['week'])
    expect(view.groups[0]!.rows[0]).toMatchObject({ chipLabel: 'Thu 17', chipVariant: 'day' })
  })

  it('groups a task due 9 days out under Later, just past the This week window', () => {
    const t = task({ id: 'storage', freq: 'quarterly', points: 8 })
    const c = complete(t, { forUid: ANA })
    const dueAt = dueDayFor(c.at, 9, TZ) // +9 days is Fri 2026-09-18.
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt, days: 9 })
    const view = buildFor([t], [c, sched])

    expect(view.groups.map((g) => g.key)).toEqual(['later'])
    expect(view.groups[0]!.label).toBe('Later')
    expect(view.groups[0]!.rows[0]).toMatchObject({ chipLabel: 'Fri 18', chipVariant: 'day' })
  })

  it('omits a group entirely when nothing falls into it, keeping the rest in order', () => {
    const today = task({ id: 'today-task', freq: 'weekly' })
    const c1 = complete(today, { at: daysAgo(8) })
    const sched1 = event('schedule', { taskId: today.id, refEventId: c1.id, dueAt: dueDayFor(c1.at, 7, TZ), days: 7 })
    const later = task({ id: 'later-task', freq: 'quarterly' })
    const c2 = complete(later)
    const sched2 = event('schedule', { taskId: later.id, refEventId: c2.id, dueAt: dueDayFor(c2.at, 20, TZ), days: 20 })
    const view = buildFor([today, later], [c1, sched1, c2, sched2])

    expect(view.groups.map((g) => g.key)).toEqual(['today', 'later'])
  })

  it('a task never done shows "Not done yet" -- reachable only via a fabricated schedule map, since a real schedule always follows a completion', () => {
    const t = task({ id: 'ghost', category: 'admin', points: 1 })
    const schedule = new Map<string, TaskSchedule>([[t.id, { taskId: t.id, state: 'due', dueAt: NOW, days: 7 }]])
    const view = buildScheduleView({ schedule, events: [], tasks: [t], household: HH, now: NOW })

    expect(view.groups[0]!.rows[0]!.subline).toBe('Not done yet')
  })

  it('sorts rows within a group by due day, then by task name', () => {
    const early = task({ id: 'early', name: 'Zebra crossing check', freq: 'weekly' })
    const cEarly = complete(early, { at: NOW })
    const schedEarly = event('schedule', {
      taskId: early.id,
      refEventId: cEarly.id,
      dueAt: dueDayFor(cEarly.at, 3, TZ),
      days: 3,
    })
    const lateA = task({ id: 'late-a', name: 'Zebra crossing check', freq: 'weekly' })
    const cLateA = complete(lateA, { at: NOW })
    const schedLateA = event('schedule', {
      taskId: lateA.id,
      refEventId: cLateA.id,
      dueAt: dueDayFor(cLateA.at, 5, TZ),
      days: 5,
    })
    const lateB = task({ id: 'late-b', name: 'Apple orchard check', freq: 'weekly' })
    const cLateB = complete(lateB, { at: NOW })
    const schedLateB = event('schedule', {
      taskId: lateB.id,
      refEventId: cLateB.id,
      dueAt: dueDayFor(cLateB.at, 5, TZ),
      days: 5,
    })
    const view = buildFor([early, lateA, lateB], [cEarly, schedEarly, cLateA, schedLateA, cLateB, schedLateB])

    expect(view.groups[0]!.rows.map((r) => r.taskId)).toEqual(['early', 'late-b', 'late-a'])
  })

  it('excludes an archived top-level task even when it carries an effective schedule', () => {
    const t = task({ id: 'archived-task', freq: 'weekly', archived: true })
    const c = complete(t, { at: NOW })
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt: dueDayFor(c.at, 3, TZ), days: 3 })
    const view = buildFor([t], [c, sched])

    expect(view.groups).toEqual([])
  })

  it('excludes a kid task from Upcoming even if a schedule map claims it is due (defense in depth)', () => {
    const kid = task({ id: 'kid-task', forRole: 'kid', points: 1 })
    const schedule = new Map<string, TaskSchedule>([[kid.id, { taskId: kid.id, state: 'due', dueAt: NOW, days: 1 }]])
    const view = buildScheduleView({ schedule, events: [], tasks: [kid], household: HH, now: NOW })

    expect(view.groups).toEqual([])
  })

  it('a group parent sums its active sub-items plus the combo bonus, excluding archived children', () => {
    const parent = task({ id: 'grp', name: 'Clean bathroom', points: 0, comboBonus: 2, freq: 'weekly' })
    const toilet = task({ id: 'toilet', name: 'Toilet', points: 4, parentId: 'grp', freq: 'weekly' })
    const sinkArchived = task({
      id: 'sink',
      name: 'Sink',
      points: 2,
      parentId: 'grp',
      freq: 'weekly',
      archived: true,
    })
    const shower = task({ id: 'shower', name: 'Shower', points: 4, parentId: 'grp', freq: 'weekly' })
    const c1 = complete(toilet, { at: daysAgo(6), forUid: ANA })
    const c2 = complete(shower, { at: daysAgo(6), forUid: ANA })
    const bonus = event('bonus', {
      forUid: ANA,
      points: 2,
      combo: parent.id,
      day: dayKey(daysAgo(6), TZ),
      at: daysAgo(6),
    })
    const dueAt = dueDayFor(daysAgo(6), 7, TZ)
    const sched = event('schedule', { taskId: parent.id, refEventId: c2.id, dueAt, days: 7 })
    const view = buildFor([parent, toilet, sinkArchived, shower], [c1, c2, bonus, sched])

    const row = view.groups[0]!.rows[0]!
    expect(row.taskId).toBe('grp')
    expect(row.points).toBe(4 + 4 + 2)
    expect(row.subline).toBe('6 days ago · Ana')
  })

  it('a group parent with a combo bonus but no active children is worth just the bonus', () => {
    const parent = task({ id: 'grp', name: 'Clean bathroom', points: 0, comboBonus: 2, freq: 'weekly' })
    const onlyChild = task({ id: 'toilet', points: 4, parentId: 'grp', freq: 'weekly', archived: true })
    const c = complete(parent, { at: NOW })
    const sched = event('schedule', { taskId: parent.id, refEventId: c.id, dueAt: dueDayFor(c.at, 7, TZ), days: 7 })
    const view = buildFor([parent, onlyChild], [c, sched])

    expect(view.groups[0]!.rows[0]!.points).toBe(2)
  })
})

describe('buildScheduleView: Recently done', () => {
  it('includes only live completes from the last 7 days, newest first', () => {
    const older = task({ id: 'older', name: 'Older task' })
    const newer = task({ id: 'newer', name: 'Newer task' })
    const cOld = complete(older, { at: daysAgo(8) })
    const cNew = complete(newer, { at: daysAgo(1), forUid: BEN })
    const view = buildFor([older, newer], [cOld, cNew])

    expect(view.recent.map((r) => r.taskId)).toEqual(['newer'])
  })

  it('caps Recently done at 10 rows, newest first', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task({ id: `t${i}`, name: `Task ${i}` }))
    const events = tasks.map((t, i) => complete(t, { at: daysAgo(i * 0.4) }))
    const view = buildFor(tasks, events)

    expect(view.recent).toHaveLength(10)
    expect(view.recent[0]!.taskId).toBe('t0')
    expect(view.recent[9]!.taskId).toBe('t9')
  })

  it("a comboBonus group's Do all appears once, via its bonus event", () => {
    const parent = task({ id: 'grp', name: 'Clean bathroom', points: 0, comboBonus: 2 })
    const toilet = task({ id: 'toilet', name: 'Toilet', points: 4, parentId: 'grp' })
    const sink = task({ id: 'sink', name: 'Sink', points: 2, parentId: 'grp' })
    const at = daysAgo(1)
    const c1 = complete(toilet, { at, forUid: ANA })
    const c2 = complete(sink, { at, forUid: ANA })
    const bonus = event('bonus', { forUid: ANA, points: 2, combo: 'grp', day: dayKey(at, TZ), at })
    const view = buildFor([parent, toilet, sink], [c1, c2, bonus])

    expect(view.recent).toHaveLength(1)
    expect(view.recent[0]).toMatchObject({ taskId: 'grp', name: 'Clean bathroom', forUid: ANA })
  })

  it('a group without a combo bonus shows its sub-item completes individually', () => {
    const parent = task({ id: 'wash', name: 'Hand-wash dishes', points: 0 })
    const pots = task({ id: 'pots', name: 'Pots', points: 2, parentId: 'wash' })
    const pans = task({ id: 'pans', name: 'Pans', points: 2, parentId: 'wash' })
    const c1 = complete(pots, { at: daysAgo(1) })
    const c2 = complete(pans, { at: daysAgo(2) })
    const view = buildFor([parent, pots, pans], [c1, c2])

    expect(view.recent.map((r) => r.taskId).sort()).toEqual(['pans', 'pots'])
  })

  it('excludes kid tasks from Recently done', () => {
    const kid = task({ id: 'kid-task', forRole: 'kid', points: 1 })
    const c = complete(kid, { at: daysAgo(1), forUid: MIA, points: 1 })
    const view = buildFor([kid], [c])

    expect(view.recent).toEqual([])
  })

  it('ignores a bonus event whose combo names a kid task or no task at all', () => {
    const kidParent = task({ id: 'kid-grp', forRole: 'kid', comboBonus: 1, points: 0 })
    const bonusForKid = event('bonus', { forUid: MIA, points: 1, combo: 'kid-grp', day: dayKey(NOW, TZ), at: NOW })
    const bonusForGhost = event('bonus', {
      forUid: ANA,
      points: 2,
      combo: 'no-such-task',
      day: dayKey(NOW, TZ),
      at: NOW,
    })
    const view = buildFor([kidParent], [bonusForKid, bonusForGhost])

    expect(view.recent).toEqual([])
  })

  it('labels a never-scheduled row "not scheduled"', () => {
    const t = task({ id: 'lone' })
    const c = complete(t, { at: daysAgo(1) })
    const view = buildFor([t], [c])

    expect(view.recent[0]!.backLabel).toBe('not scheduled')
  })

  it('labels a row due tomorrow "back tomorrow"', () => {
    const t = task({ id: 'soon' })
    const c = complete(t, { at: NOW })
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt: dueDayFor(c.at, 1, TZ), days: 1 })
    const view = buildFor([t], [c, sched])

    expect(view.recent[0]!.backLabel).toBe('back tomorrow')
  })

  it('labels a row due in several days "back in N days"', () => {
    const t = task({ id: 'later-back' })
    const c = complete(t, { at: daysAgo(2) })
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt: dueDayFor(c.at, 7, TZ), days: 7 })
    const view = buildFor([t], [c, sched])

    // Completed 2 days ago with a 7-day schedule: due in 5 days from now.
    expect(view.recent[0]!.backLabel).toBe('back in 5 days')
  })

  it('labels an overdue row "back today" rather than a negative day count', () => {
    const t = task({ id: 'overdue-back' })
    const c = complete(t, { at: daysAgo(5) })
    const sched = event('schedule', { taskId: t.id, refEventId: c.id, dueAt: dueDayFor(c.at, 3, TZ), days: 3 })
    const view = buildFor([t], [c, sched])

    expect(view.recent[0]!.backLabel).toBe('back today')
  })

  it('carries a formatted time label alongside each row (today / yesterday / weekday)', () => {
    const today = task({ id: 'today-row' })
    const cToday = complete(today, { at: NOW })
    const yesterday = task({ id: 'yesterday-row' })
    const cYesterday = complete(yesterday, { at: daysAgo(1) })
    const olderWeekday = task({ id: 'weekday-row' })
    const cOlder = complete(olderWeekday, { at: daysAgo(3) })
    const view = buildFor([today, yesterday, olderWeekday], [cToday, cYesterday, cOlder])

    const byId = (id: string) => view.recent.find((r) => r.taskId === id)!
    expect(byId('today-row').timeLabel).toMatch(/^Today, \d{2}:\d{2}$/)
    expect(byId('yesterday-row').timeLabel).toMatch(/^Yesterday, \d{2}:\d{2}$/)
    expect(byId('weekday-row').timeLabel).toMatch(/^[A-Z][a-z]{2}, \d{2}:\d{2}$/)
  })
})

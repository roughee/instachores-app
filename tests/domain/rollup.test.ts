import { describe, expect, it } from 'vitest'
import { rollupForWeek } from '@/domain/derive'
import { SEED_IDS, seedTasks } from '@/domain/seed'
import { DAY_MS, startOfWeek } from '@/domain/time'
import { ANA, BEN, NOW, TZ, complete, event, household } from '../helpers/fixtures'

const h = household()
const tasks = seedTasks(NOW, ANA)
const seed = (id: string) => tasks.find((t) => t.id === id)!
const at = (iso: string) => new Date(iso)

describe('rollupForWeek', () => {
  it('runs Monday 00:00 to the following Monday 00:00 household-local', () => {
    const weekStart = startOfWeek(NOW, TZ) // Monday 2026-09-07 00:00 Vilnius = 2026-09-06T21:00:00.000Z
    const r = rollupForWeek({ events: [], tasks, household: h, weekStart, now: NOW })
    expect(r.start.toISOString()).toBe(weekStart.toISOString())
    expect(r.end.toISOString()).toBe('2026-09-13T21:00:00.000Z')
  })

  it('an event at Sunday 23:59 belongs to the previous week, not this one', () => {
    const weekStart = startOfWeek(NOW, TZ)
    const sundayLate = complete(seed(SEED_IDS.pots), { at: at('2026-09-06T20:59:59.000Z') })
    const mondayStart = complete(seed(SEED_IDS.pots), { at: at('2026-09-06T21:00:00.000Z') })

    const thisWeek = rollupForWeek({ events: [sundayLate, mondayStart], tasks, household: h, weekStart, now: NOW })
    expect(thisWeek.household).toBe(2)

    const prevWeekStart = startOfWeek(new Date(weekStart.getTime() - DAY_MS), TZ)
    const prevWeek = rollupForWeek({
      events: [sundayLate, mondayStart],
      tasks,
      household: h,
      weekStart: prevWeekStart,
      now: NOW,
    })
    expect(prevWeek.household).toBe(2)
  })

  it('counts events with start <= at < end, excluding the following Monday 00:00', () => {
    const weekStart = startOfWeek(NOW, TZ)
    const probe = rollupForWeek({ events: [], tasks, household: h, weekStart, now: NOW })
    const justBefore = complete(seed(SEED_IDS.pots), { at: new Date(probe.end.getTime() - 1) })
    const atEnd = complete(seed(SEED_IDS.pots), { at: probe.end })

    const r = rollupForWeek({ events: [justBefore, atEnd], tasks, household: h, weekStart, now: NOW })
    expect(r.household).toBe(2)
  })

  it('pro-rates the target by elapsed days for a partial week', () => {
    const weekStart = startOfWeek(NOW, TZ) // NOW is Wednesday: 3 elapsed days
    const r = rollupForWeek({ events: [], tasks, household: h, weekStart, now: NOW })
    expect(r.elapsedDays).toBe(3)
    expect(r.proRatedTarget).toBe(Math.round((250 * 3) / 7))
    expect(r.target).toBe(250)
  })

  it('shows the full target and 7 elapsed days once the week is over', () => {
    const weekStart = startOfWeek(NOW, TZ)
    const afterWeek = new Date(weekStart.getTime() + 10 * DAY_MS)
    const r = rollupForWeek({ events: [], tasks, household: h, weekStart, now: afterWeek })
    expect(r.elapsedDays).toBe(7)
    expect(r.proRatedTarget).toBe(250)
  })

  it('never reports more than 7 or fewer than 1 elapsed days', () => {
    const weekStart = startOfWeek(NOW, TZ)
    const justStarted = rollupForWeek({ events: [], tasks, household: h, weekStart, now: weekStart })
    expect(justStarted.elapsedDays).toBe(1)
  })

  it('category totals sum to member totals', () => {
    const weekStart = startOfWeek(NOW, TZ)
    const r = rollupForWeek({
      events: [
        complete(seed(SEED_IDS.pots), { forUid: ANA }),
        complete(seed(SEED_IDS.vacuumAll), { forUid: BEN }),
        complete(seed(SEED_IDS.trash), { forUid: BEN }),
        event('bonus', { forUid: BEN, points: 3, combo: 'kitchen-reset', day: '2026-09-09' }),
      ],
      tasks,
      household: h,
      weekStart,
      now: NOW,
    })
    const memberTotal = Object.values(r.byMember).reduce((s, m) => s + m.points, 0)
    const categoryTotal = Object.values(r.byCategory).reduce(
      (s, per) => s + Object.values(per).reduce((a, b) => a + b, 0),
      0,
    )
    expect(memberTotal).toBe(categoryTotal)
    expect(r.byCategory.kitchen?.[BEN]).toBe(5)
    expect(r.byMember[BEN]?.count).toBe(2)
  })

  it('reaches previous weeks by weekStart and shows only that week’s events', () => {
    const weekStart = startOfWeek(NOW, TZ)
    const prevWeekStart = startOfWeek(new Date(weekStart.getTime() - DAY_MS), TZ)
    const lastWeekEvent = complete(seed(SEED_IDS.pots), { at: new Date(prevWeekStart.getTime() + DAY_MS) })

    const prev = rollupForWeek({ events: [lastWeekEvent], tasks, household: h, weekStart: prevWeekStart, now: NOW })
    expect(prev.household).toBe(2)

    const current = rollupForWeek({ events: [lastWeekEvent], tasks, household: h, weekStart, now: NOW })
    expect(current.household).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { buildToday } from '@/domain/today'
import type { ChoreEvent } from '@/schemas'
import { ANA, BEN, MIA, NOW, TZ, complete, event, household, task } from '../helpers/fixtures'

const h = household()

const build = (events: ChoreEvent[], now: Date = NOW) =>
  buildToday({ events, tasks: [pots, laundry, kidToy], household: h, now })

const pots = task({ id: 'task-pots', name: 'Pots', category: 'kitchen', points: 2, forRole: 'adult' })
const laundry = task({ id: 'task-fold', name: 'Fold laundry', category: 'laundry', points: 3, forRole: 'adult' })
const kidToy = task({ id: 'task-toys', name: 'Put away toys', category: 'kids', points: 1, forRole: 'kid' })

describe('buildToday: rows', () => {
  it('includes only complete events from today in the household tz, newest first', () => {
    const early = complete(pots, { at: new Date('2026-09-09T05:00:00.000Z'), forUid: ANA }) // 08:00 Vilnius
    const late = complete(laundry, { at: new Date('2026-09-09T15:00:00.000Z'), forUid: BEN }) // 18:00 Vilnius
    const state = build([early, late])

    expect(state.rows.map((r) => r.eventId)).toEqual([late.id, early.id])
  })

  it('uses the household timezone, not UTC, to decide what counts as today (#18)', () => {
    // 2026-09-09T21:30:00Z is 2026-09-10 00:30 in Vilnius: tomorrow, not today.
    const tomorrowInVilnius = complete(pots, { at: new Date('2026-09-09T21:30:00.000Z') })
    // 2026-09-08T21:10:00Z is 2026-09-09 00:10 in Vilnius: today, even though its UTC day is yesterday.
    const todayInVilnius = complete(pots, { at: new Date('2026-09-08T21:10:00.000Z') })
    const state = build([tomorrowInVilnius, todayInVilnius])

    expect(state.rows.map((r) => r.eventId)).toEqual([todayInVilnius.id])
    expect(state.rows[0]!.hourKey).toBe('00')
  })

  it('hourKey is the two-digit local hour of the household tz', () => {
    const ev = complete(pots, { at: new Date('2026-09-09T15:00:00.000Z') }) // 18:00 Vilnius
    const state = build([ev])
    expect(state.rows[0]!.hourKey).toBe('18')
  })

  it('carries the task name, category and points onto the row', () => {
    const ev = complete(laundry, { forUid: BEN })
    const state = build([ev])
    expect(state.rows[0]).toMatchObject({
      eventId: ev.id,
      taskId: laundry.id,
      taskName: 'Fold laundry',
      category: 'laundry',
      forUid: BEN,
      points: 3,
      undone: false,
    })
  })

  it('flags an event undone within the last 24h as undone but keeps it visible', () => {
    const at = new Date(NOW.getTime() - 2 * 3600_000)
    const ev = complete(pots, { at })
    const undo = event('undo', { refEventId: ev.id, at: new Date(at.getTime() + 3600_000) })
    const state = build([ev, undo])

    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.undone).toBe(true)
  })

  it('drops an event whose undo landed more than 24h after it', () => {
    const at = new Date('2026-09-08T21:10:00.000Z') // 2026-09-09 00:10 Vilnius: today
    const ev = complete(pots, { at })
    const undo = event('undo', { refEventId: ev.id, at: new Date(at.getTime() + 25 * 3600_000) })
    const state = build([ev, undo])

    expect(state.rows).toHaveLength(0)
  })

  it('excludes kid tasks: the star board owns those, not the household feed', () => {
    const ev = complete(kidToy, { forUid: MIA })
    const state = build([ev])
    expect(state.rows).toHaveLength(0)
  })
})

describe('buildToday: totals', () => {
  it('sums undone-excluded points into household and per-member totals', () => {
    const live = complete(pots, { forUid: ANA, points: 2 })
    const undoneAt = new Date(NOW.getTime() - 1000)
    const undone = complete(laundry, { forUid: BEN, points: 3, at: undoneAt })
    const undo = event('undo', { refEventId: undone.id, at: new Date(undoneAt.getTime() + 1000) })

    const state = build([live, undone, undo])

    expect(state.totals.household).toBe(2)
    expect(state.totals.byMember).toEqual({ [ANA]: 2 })
  })

  it('is all-zero for no events', () => {
    const state = build([])
    expect(state.totals).toEqual({ household: 0, byMember: {} })
  })
})

describe('buildToday: timezone (Vilnius fixture, #18)', () => {
  it('groups an hour boundary correctly across the UTC offset', () => {
    // NOW is 2026-09-09T18:00:00Z, 21:00 in Vilnius (UTC+3).
    expect(TZ).toBe('Europe/Vilnius')
    const ev = complete(pots, { at: NOW })
    const state = build([ev], NOW)
    expect(state.rows[0]!.hourKey).toBe('21')
  })
})

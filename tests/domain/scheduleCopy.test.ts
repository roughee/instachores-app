import { describe, expect, it } from 'vitest'
import {
  dayNumber,
  daysAgoLabel,
  memberName,
  scheduledBackLabel,
  taskRowCopy,
  weekdayShort,
} from '@/domain/scheduleCopy'
import type { TaskSchedule } from '@/domain/schedule'
import { ANA, BEN, NOW, TZ, household } from '../helpers/fixtures'

const DAY_MS = 86_400_000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS)
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY_MS)

function schedule(overrides: Partial<TaskSchedule> = {}): TaskSchedule {
  return { taskId: 'task-1', state: 'listed', ...overrides }
}

describe('memberName', () => {
  const h = household()

  it("is the member's name for a known uid", () => {
    expect(memberName(h, ANA)).toBe('Ana')
    expect(memberName(h, BEN)).toBe('Ben')
  })

  it('falls back to "someone" for an unknown uid', () => {
    expect(memberName(h, 'not-a-member')).toBe('someone')
  })

  it('falls back to "someone" for an undefined uid', () => {
    expect(memberName(h, undefined)).toBe('someone')
  })
})

describe('daysAgoLabel', () => {
  it('is "today" for the same household-local day', () => {
    expect(daysAgoLabel(NOW, NOW, TZ)).toBe('today')
  })

  it('is "yesterday" for one household-local day back', () => {
    expect(daysAgoLabel(daysAgo(1), NOW, TZ)).toBe('yesterday')
  })

  it('is "N days ago" for more than one day back', () => {
    expect(daysAgoLabel(daysAgo(2), NOW, TZ)).toBe('2 days ago')
    expect(daysAgoLabel(daysAgo(9), NOW, TZ)).toBe('9 days ago')
  })
})

describe('weekdayShort', () => {
  it('is the short weekday `at` falls on in the household zone', () => {
    // NOW is Wed 2026-09-09 21:00 Vilnius.
    expect(weekdayShort(NOW, TZ)).toBe('Wed')
  })
})

describe('taskRowCopy', () => {
  const h = household()

  it('is empty for a task that was never done', () => {
    expect(taskRowCopy(schedule({ state: 'listed' }), h, NOW, TZ)).toEqual({})
  })

  it('shows only the last-done subline for a listed task with a completion', () => {
    const s = schedule({ state: 'listed', lastDoneAt: daysAgo(2), lastDoneBy: ANA })
    expect(taskRowCopy(s, h, NOW, TZ)).toEqual({ subline: 'Last done 2 days ago by Ana' })
  })

  it('falls back to "someone" for an unknown last-done member', () => {
    const s = schedule({ state: 'listed', lastDoneAt: daysAgo(1), lastDoneBy: 'ghost' })
    expect(taskRowCopy(s, h, NOW, TZ)).toEqual({ subline: 'Last done yesterday by someone' })
  })

  it('shows "Due today" plus the last-done line and no chip when due today (matches the mockup: gentle, not nagging)', () => {
    const s = schedule({ state: 'due', dueAt: NOW, lastDoneAt: daysAgo(5), lastDoneBy: BEN })
    expect(taskRowCopy(s, h, NOW, TZ)).toEqual({
      subline: 'Due today. Last done 5 days ago by Ben',
    })
  })

  it('shows "Due since <weekday>" plus the last-done line and a "Due <weekday>" chip when overdue', () => {
    // Due day two days ago (a Monday); NOW is Wednesday.
    const s = schedule({ state: 'due', dueAt: daysAgo(2), lastDoneAt: daysAgo(9), lastDoneBy: ANA })
    expect(taskRowCopy(s, h, NOW, TZ)).toEqual({
      subline: 'Due since Mon. Last done 9 days ago by Ana',
      due: 'Due Mon',
    })
  })
})

describe('dayNumber', () => {
  it('is the household-local day number `at` falls on', () => {
    // NOW + 6 days is Tue 2026-09-15 in Vilnius (schedule.test.ts's own example).
    expect(dayNumber(daysFromNow(6), TZ)).toBe('15')
  })
})

describe('scheduledBackLabel', () => {
  it('is "back tomorrow" when the due day is the household-local day after now', () => {
    expect(scheduledBackLabel(daysFromNow(1), NOW, TZ)).toBe('back tomorrow')
  })

  it('is "back <Weekday short> <day number>" otherwise', () => {
    // NOW + 6 days is Tue 2026-09-15 in Vilnius.
    expect(scheduledBackLabel(daysFromNow(6), NOW, TZ)).toBe('back Tue 15')
  })
})

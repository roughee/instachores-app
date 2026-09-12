/**
 * Copy for the Category screen's schedule-aware rows (Plan §5.5 "States",
 * DESIGN.md's TaskButton subline/Due chip, issue #70): the last-done and
 * Due sublines for listed/due tasks, and the "back <day>" label for the
 * Scheduled fold. Pure and household-tz aware, same split as the rest of
 * `src/domain/`: no Vue, no fetch, just strings from a `TaskSchedule` and a
 * clock. No em-dashes or en-dashes (Plan §7, DESIGN.md §8).
 */
import type { Household } from '@/schemas'
import type { TaskSchedule } from './schedule'
import { DAY_MS, dayKey } from './time'

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>()
const dayNumberFormatters = new Map<string, Intl.DateTimeFormat>()

function cachedFormatter(cache: Map<string, Intl.DateTimeFormat>, tz: string, options: Intl.DateTimeFormatOptions) {
  let f = cache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...options })
    cache.set(tz, f)
  }
  return f
}

/** Whole calendar days from `fromKey` to `toKey` ('YYYY-MM-DD'), may be negative. */
function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toKey.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS)
}

/** The household's name for `uid`, or "someone" when it names no member
 * (Plan §5.5 "States": the copy never blames a uid it cannot resolve). */
export function memberName(household: Household, uid: string | undefined): string {
  if (uid === undefined) return 'someone'
  return household.members[uid]?.name ?? 'someone'
}

/** The short weekday (e.g. "Thu") `at` falls on in the household zone. */
export function weekdayShort(at: Date, tz: string): string {
  return cachedFormatter(weekdayFormatters, tz, { weekday: 'short' }).format(at)
}

/** The household-local day number (e.g. "15") `at` falls on. */
function dayNumber(at: Date, tz: string): string {
  return cachedFormatter(dayNumberFormatters, tz, { day: 'numeric' }).format(at)
}

/** "today" / "yesterday" / "N days ago", from the household-local day gap
 * between `at` and `now`. Never negative: an `at` on or after `now`'s day
 * reads as "today". */
export function daysAgoLabel(at: Date, now: Date, tz: string): string {
  const days = Math.max(0, daysBetweenKeys(dayKey(at, tz), dayKey(now, tz)))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** The Category screen's subline + Due chip text for a listed or due task
 * (DESIGN.md's TaskButton). `{}` for a task that was never done, and for an
 * away task -- that one renders in the Scheduled fold instead, via
 * `scheduledBackLabel` below, not through this function.
 *
 * Due today gets the "Due today." subline but no chip, matching the
 * mockup (`docs/design/schedule/category-scheduled-light.png`) and Plan
 * §9's "gentle, not nagging": only an overdue task, more days past its own
 * due day, earns the extra "Due <weekday>" chip alongside its subline. */
export function taskRowCopy(
  schedule: TaskSchedule,
  household: Household,
  now: Date,
  tz: string,
): { subline?: string; due?: string } {
  if (schedule.lastDoneAt === undefined) return {}
  const doneLine = `Last done ${daysAgoLabel(schedule.lastDoneAt, now, tz)} by ${memberName(household, schedule.lastDoneBy)}`

  if (schedule.state !== 'due' || schedule.dueAt === undefined) {
    return { subline: doneLine }
  }

  const dueToday = dayKey(schedule.dueAt, tz) === dayKey(now, tz)
  if (dueToday) {
    return { subline: `Due today. ${doneLine}` }
  }
  const weekday = weekdayShort(schedule.dueAt, tz)
  return { subline: `Due since ${weekday}. ${doneLine}`, due: `Due ${weekday}` }
}

/** The Scheduled fold's "back <day>" (Plan §5.5, DESIGN.md's Category
 * fold): "back tomorrow" when `dueAt` falls on the household-local day
 * right after `now`, else "back <Weekday short> <day number>" (e.g. "back
 * Tue 15"). */
export function scheduledBackLabel(dueAt: Date, now: Date, tz: string): string {
  const days = daysBetweenKeys(dayKey(now, tz), dayKey(dueAt, tz))
  if (days === 1) return 'back tomorrow'
  return `back ${weekdayShort(dueAt, tz)} ${dayNumber(dueAt, tz)}`
}

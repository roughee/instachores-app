/**
 * The Schedule tab's own view (issue #71, Plan §5.5 `#/schedule`): what is
 * due, coming up, and was done lately, all derived from `eventsStore.schedule`
 * (`src/domain/schedule.ts`) plus the raw events -- no Vue, no fetch, same
 * split as the rest of `src/domain/`.
 *
 * Upcoming rows only ever come from a top-level task (a plain task, or a
 * group's own parent id) -- exactly the id `eventsStore.schedule` carries an
 * effective schedule for once "Next time?" has been used on it. A group's
 * children never get their own row here, mirroring `CategoryScreen`'s
 * `scheduleTaskFor` (issue #70): a "Do all" followed by "Schedule for X"
 * currently attaches the `schedule` event to the *last completed child's*
 * task id rather than the parent's (an existing, out-of-scope nuance from
 * issue #69's `eventsStore.scheduleNext`, called out in
 * `tests/screens/CategoryScreen.test.ts`) -- so that flow does not yet
 * surface a group under Upcoming either, same as it does not fold on
 * Category today. Fixing that is issue #69/#70 territory, not this one.
 */
import type { Category, ChoreEvent, Household, Task } from '@/schemas'
import { liveEvents } from './events'
import type { TaskSchedule } from './schedule'
import { dayNumber, daysAgoLabel, memberName, weekdayShort } from './scheduleCopy'
import { DAY_MS, dayKey, localParts } from './time'

export type ScheduleGroupKey = 'today' | 'tomorrow' | 'week' | 'later'

const GROUP_LABELS: Record<ScheduleGroupKey, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
}

export interface ScheduleViewRow {
  taskId: string
  name: string
  category: Category
  /** The task's own points, or a group parent's active sub-items summed with its combo bonus. */
  points: number
  /** "<N days ago> · <Member>", or "Not done yet" for a task never completed. */
  subline: string
  dueAt: Date
  chipLabel: string
  chipVariant: 'due' | 'day'
}

export interface ScheduleViewGroup {
  key: ScheduleGroupKey
  label: string
  rows: ScheduleViewRow[]
}

export interface ScheduleViewRecentRow {
  /** The underlying complete/bonus event's own id -- unique per completion. */
  key: string
  taskId: string
  name: string
  forUid: string
  at: Date
  /** "Today, 08:15" / "Yesterday, 19:40" / "Thu, 21:05" (household tz, 24h). */
  timeLabel: string
  /** "back in N days" / "back tomorrow" / "back today" / "not scheduled". */
  backLabel: string
}

export interface ScheduleView {
  groups: ScheduleViewGroup[]
  recent: ScheduleViewRecentRow[]
}

export interface BuildScheduleViewInput {
  schedule: ReadonlyMap<string, TaskSchedule>
  events: readonly ChoreEvent[]
  tasks: readonly Task[]
  household: Household
  now: Date
}

/** Whole calendar days from `fromKey` to `toKey` ('YYYY-MM-DD'), may be negative. */
function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toKey.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS)
}

/** A group parent's own points on the Schedule tab: its active (non-archived)
 * children summed, plus its combo bonus if any -- the same maths as
 * `TaskGroup.vue`'s "Do all" hint. A plain task (no children, no combo
 * bonus) is just its own `points`. */
function rowPoints(t: Task, children: Task[]): number {
  if (children.length === 0 && t.comboBonus === undefined) return t.points
  return children.reduce((sum, c) => sum + c.points, 0) + (t.comboBonus ?? 0)
}

function rowSubline(schedule: TaskSchedule, household: Household, now: Date, tz: string): string {
  if (schedule.lastDoneAt === undefined) return 'Not done yet'
  return `${daysAgoLabel(schedule.lastDoneAt, now, tz)} · ${memberName(household, schedule.lastDoneBy)}`
}

/** The upcoming section's group, chip text and chip variant for one row,
 * from its effective schedule state and due day (Plan §5.5). */
function rowPlacement(
  schedule: TaskSchedule,
  dueAt: Date,
  now: Date,
  tz: string,
): { key: ScheduleGroupKey; chipLabel: string; chipVariant: 'due' | 'day' } {
  if (schedule.state === 'due') return { key: 'today', chipLabel: 'Due', chipVariant: 'due' }

  const daysUntil = daysBetweenKeys(dayKey(now, tz), dayKey(dueAt, tz))
  if (daysUntil === 1) return { key: 'tomorrow', chipLabel: weekdayShort(dueAt, tz), chipVariant: 'day' }
  const chipLabel = `${weekdayShort(dueAt, tz)} ${dayNumber(dueAt, tz)}`
  return { key: daysUntil <= 8 ? 'week' : 'later', chipLabel, chipVariant: 'day' }
}

/** "Today, 08:15" / "Yesterday, 19:40" / "Thu, 21:05" (Recently done's own
 * second line): the household-local day word (falling back to the short
 * weekday past yesterday) plus a 24h HH:MM. */
function recentTimeLabel(at: Date, now: Date, tz: string): string {
  const p = localParts(at, tz)
  const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  const days = daysBetweenKeys(dayKey(at, tz), dayKey(now, tz))
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${weekdayShort(at, tz)}, ${time}`
}

/** "back in N days" / "back tomorrow" / "back today" / "not scheduled": how
 * far off a Recently done row's task is due again, from its *current*
 * effective schedule (which already reflects this and any later
 * completion) -- not from the completion the row itself represents. "back
 * today" covers a task whose due day has already passed without a redo, so
 * the count never reads as a confusing negative. */
function recentBackLabel(dueAt: Date | undefined, now: Date, tz: string): string {
  if (dueAt === undefined) return 'not scheduled'
  const days = daysBetweenKeys(dayKey(now, tz), dayKey(dueAt, tz))
  if (days <= 0) return 'back today'
  if (days === 1) return 'back tomorrow'
  return `back in ${days} days`
}

export function buildScheduleView(input: BuildScheduleViewInput): ScheduleView {
  const { schedule, events, tasks, household, now } = input
  const tz = household.tz
  const byId = new Map(tasks.map((t) => [t.id, t]))

  const activeChildrenOf = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.parentId === undefined || t.archived) continue
    activeChildrenOf.set(t.parentId, [...(activeChildrenOf.get(t.parentId) ?? []), t])
  }

  const rowsByGroup: Record<ScheduleGroupKey, ScheduleViewRow[]> = { today: [], tomorrow: [], week: [], later: [] }

  for (const t of tasks) {
    if (t.archived || t.parentId !== undefined || t.forRole === 'kid') continue
    const s = schedule.get(t.id)
    if (!s || s.dueAt === undefined || (s.state !== 'due' && s.state !== 'away')) continue

    const children = activeChildrenOf.get(t.id) ?? []
    const { key, chipLabel, chipVariant } = rowPlacement(s, s.dueAt, now, tz)
    rowsByGroup[key].push({
      taskId: t.id,
      name: t.name,
      category: t.category,
      points: rowPoints(t, children),
      subline: rowSubline(s, household, now, tz),
      dueAt: s.dueAt,
      chipLabel,
      chipVariant,
    })
  }

  const orderedKeys: ScheduleGroupKey[] = ['today', 'tomorrow', 'week', 'later']
  for (const key of orderedKeys) {
    rowsByGroup[key].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.name.localeCompare(b.name))
  }
  const groups: ScheduleViewGroup[] = orderedKeys
    .filter((key) => rowsByGroup[key].length > 0)
    .map((key) => ({ key, label: GROUP_LABELS[key], rows: rowsByGroup[key] }))

  // Recently done (Plan §5.5): live completes/bonuses from the last 7 days,
  // kid tasks excluded, capped at 10, newest first. A comboBonus group's
  // "Do all" collapses to one row per household-local day, keyed by its
  // bonus event; a group with no combo bonus never produces one, so its
  // sub-items always show individually -- no extra branching needed for
  // that case, it falls out of the same suppression check below.
  const windowStart = now.getTime() - 7 * DAY_MS
  const withinWindow = (at: Date) => at.getTime() >= windowStart && at.getTime() <= now.getTime()

  interface RawRecent {
    key: string
    taskId: string
    name: string
    forUid: string
    at: Date
  }
  const raw: RawRecent[] = []
  const bonusedParentDays = new Set<string>()

  for (const e of liveEvents(events)) {
    if (e.type !== 'bonus' || !withinWindow(e.at)) continue
    const parent = byId.get(e.combo)
    if (!parent || parent.forRole === 'kid') continue
    bonusedParentDays.add(`${e.combo}|${dayKey(e.at, tz)}`)
    raw.push({ key: e.id, taskId: parent.id, name: parent.name, forUid: e.forUid, at: e.at })
  }

  for (const e of liveEvents(events)) {
    if (e.type !== 'complete' || !withinWindow(e.at)) continue
    const t = byId.get(e.taskId)
    if (!t || t.forRole === 'kid') continue
    if (t.parentId !== undefined) {
      const parent = byId.get(t.parentId)
      if (parent?.comboBonus !== undefined && bonusedParentDays.has(`${t.parentId}|${dayKey(e.at, tz)}`)) continue
    }
    raw.push({ key: e.id, taskId: t.id, name: t.name, forUid: e.forUid, at: e.at })
  }

  raw.sort((a, b) => b.at.getTime() - a.at.getTime())
  const recent: ScheduleViewRecentRow[] = raw.slice(0, 10).map((r) => ({
    ...r,
    timeLabel: recentTimeLabel(r.at, now, tz),
    backLabel: recentBackLabel(schedule.get(r.taskId)?.dueAt, now, tz),
  }))

  return { groups, recent }
}

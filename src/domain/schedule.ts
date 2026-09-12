import type { ChoreEvent, EventOf, Freq, Household, Task } from '@/schemas'
import { liveEvents } from './events'
import { DAY_MS, dayKey, localMidnight, shiftDay } from './time'

/** How many days a frequency "lasts" before the task is due again; null for ad hoc. */
export function windowDays(freq: Freq): number | null {
  switch (freq) {
    case 'daily':
      return 1
    case 'weekly':
      return 7
    case 'biweekly':
      return 14
    case 'monthly':
      return 30
    case 'quarterly':
      return 90
    case 'adhoc':
      return null
  }
}

/**
 * Due means: done before, and its window has elapsed since. A task that was
 * never done is not nagged about (Plan §9: gentle, not nagging).
 */
export function isDue(task: Task, lastDoneAt: Date | undefined, now: Date): boolean {
  if (task.archived || !lastDoneAt) return false
  const days = windowDays(task.freq)
  if (days === null) return false
  return now.getTime() - lastDoneAt.getTime() >= days * DAY_MS
}

/**
 * The interval the "Next time?" sheet should preselect (Plan §5.5): the
 * task's own `intervalDays` when set, else its frequency's default window;
 * an ad hoc task with no override opens the sheet with nothing preselected.
 */
export function suggestedIntervalDays(task: Task): number | undefined {
  if (task.intervalDays !== undefined) return task.intervalDays
  return windowDays(task.freq) ?? undefined
}

/**
 * The household-local midnight `days` local days after `completedAt`'s local
 * day. Goes through `dayKey` + `localMidnight` (issue #66) so the "Next
 * time?" due day lands the same way the rest of the domain handles DST.
 */
export function dueDayFor(completedAt: Date, days: number, tz: string): Date {
  const key = shiftDay(dayKey(completedAt, tz), days)
  const [year, month, day] = key.split('-').map(Number) as [number, number, number]
  return localMidnight(year, month, day, tz)
}

export type ScheduleState = 'listed' | 'away' | 'due'

/** Where one task stands in the Schedule tab (Plan §5.5, issue #64/#66). */
export interface TaskSchedule {
  taskId: string
  /** From the latest live `complete` for this task, regardless of scheduling. */
  lastDoneAt?: Date
  lastDoneBy?: string
  dueAt?: Date
  days?: number
  /** The effective `schedule` event's id, so "bring back early" knows what to reference. */
  scheduleEventId?: string
  state: ScheduleState
}

export interface DeriveScheduleInput {
  events: readonly ChoreEvent[]
  tasks: readonly Task[]
  household: Household
  now: Date
}

/**
 * One `TaskSchedule` per task in `tasks`. Kid tasks skip the schedule rules
 * entirely and stay `listed` (Plan §5.5: "kid tasks never get the sheet").
 * For the rest, the effective schedule is the latest live `schedule` event
 * for the task whose referenced complete is still live, that no live
 * `unschedule` targets, and that no later live complete for the same task
 * has superseded (issue #66).
 */
export function deriveSchedule(input: DeriveScheduleInput): Map<string, TaskSchedule> {
  const { events, tasks, household, now } = input
  const tz = household.tz
  const live = liveEvents(events)

  const unscheduledIds = new Set<string>()
  const liveCompleteIds = new Set<string>()
  for (const e of live) {
    if (e.type === 'unschedule') unscheduledIds.add(e.refEventId)
    if (e.type === 'complete') liveCompleteIds.add(e.id)
  }
  const childrenOf = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.parentId === undefined) continue
    childrenOf.set(t.parentId, [...(childrenOf.get(t.parentId) ?? []), t])
  }

  const out = new Map<string, TaskSchedule>()
  for (const t of tasks) {
    if (t.forRole === 'kid') {
      out.set(t.id, { taskId: t.id, state: 'listed' })
      continue
    }

    // "Done" marks for this task: its own completes, plus, for a group parent,
    // the bonus each "Do all" appends (or, without a combo bonus, any sub-item
    // complete). A schedule for the parent references the last sub-item's
    // complete, so the reference check runs against every live complete.
    const marks: { at: Date; by: string }[] = []
    const children = childrenOf.get(t.id) ?? []
    const childIds = new Set(children.map((c) => c.id))
    for (const e of live) {
      if (e.type === 'complete' && e.taskId === t.id) marks.push({ at: e.at, by: e.forUid })
      else if (children.length > 0 && t.comboBonus !== undefined && e.type === 'bonus' && e.combo === t.id)
        marks.push({ at: e.at, by: e.forUid })
      else if (children.length > 0 && t.comboBonus === undefined && e.type === 'complete' && childIds.has(e.taskId))
        marks.push({ at: e.at, by: e.forUid })
    }
    let last: { at: Date; by: string } | undefined
    for (const m of marks) if (!last || m.at.getTime() > last.at.getTime()) last = m

    let effective: EventOf<'schedule'> | undefined
    for (const e of live) {
      if (e.type !== 'schedule' || e.taskId !== t.id) continue
      if (!liveCompleteIds.has(e.refEventId)) continue
      if (unscheduledIds.has(e.id)) continue
      if (marks.some((m) => m.at.getTime() > e.at.getTime())) continue
      if (!effective || e.at.getTime() > effective.at.getTime()) effective = e
    }

    const schedule: TaskSchedule = { taskId: t.id, state: 'listed' }
    if (last) {
      schedule.lastDoneAt = last.at
      schedule.lastDoneBy = last.by
    }
    if (effective) {
      schedule.dueAt = effective.dueAt
      schedule.days = effective.days
      schedule.scheduleEventId = effective.id
      schedule.state = dayKey(now, tz) < dayKey(effective.dueAt, tz) ? 'away' : 'due'
    }
    out.set(t.id, schedule)
  }
  return out
}

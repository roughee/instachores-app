/**
 * The Today screen's feed (issue #18, Plan §5.5 `#/today`): today's `complete`
 * events in the household's own calendar day, reverse-chronological, with an
 * event undone in the last 24h kept visible but flagged rather than dropped
 * outright. Kid tasks are the star board's business (`#/kid`), not this
 * household feed, so they never appear here -- the same split `deriveState`
 * makes between `balances` and `stars`.
 */
import type { Category, ChoreEvent, EventOf, Household, Task } from '@/schemas'
import { DAY_MS, dayKey, localParts } from './time'

export interface TodayRow {
  eventId: string
  taskId: string
  taskName: string
  category: Category
  forUid: string
  points: number
  at: Date
  /** Two-digit local hour, e.g. '21'. */
  hourKey: string
  undone: boolean
}

export interface TodayTotals {
  household: number
  byMember: Record<string, number>
}

export interface TodayState {
  rows: TodayRow[]
  totals: TodayTotals
}

export interface TodayInput {
  events: readonly ChoreEvent[]
  tasks: readonly Task[]
  household: Household
  now: Date
}

/** The most recent `undo` referencing each event id, if any. */
function latestUndoByRef(events: readonly ChoreEvent[]): Map<string, EventOf<'undo'>> {
  const map = new Map<string, EventOf<'undo'>>()
  for (const e of events) {
    if (e.type !== 'undo') continue
    const existing = map.get(e.refEventId)
    if (!existing || e.at.getTime() > existing.at.getTime()) map.set(e.refEventId, e)
  }
  return map
}

export function buildToday(input: TodayInput): TodayState {
  const { events, tasks, household, now } = input
  const tz = household.tz
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const today = dayKey(now, tz)
  const undoByRef = latestUndoByRef(events)

  const rows: TodayRow[] = []
  for (const e of events) {
    if (e.type !== 'complete') continue
    if (dayKey(e.at, tz) !== today) continue
    const t = taskById.get(e.taskId)
    if (t?.forRole === 'kid') continue

    const undo = undoByRef.get(e.id)
    let undone = false
    if (undo) {
      if (undo.at.getTime() - e.at.getTime() > DAY_MS) continue
      undone = true
    }

    rows.push({
      eventId: e.id,
      taskId: e.taskId,
      taskName: t?.name ?? e.taskId,
      category: t?.category ?? 'admin',
      forUid: e.forUid,
      points: e.points,
      at: e.at,
      hourKey: String(localParts(e.at, tz).hour).padStart(2, '0'),
      undone,
    })
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime())

  const totals: TodayTotals = { household: 0, byMember: {} }
  for (const r of rows) {
    if (r.undone) continue
    totals.household += r.points
    totals.byMember[r.forUid] = (totals.byMember[r.forUid] ?? 0) + r.points
  }

  return { rows, totals }
}

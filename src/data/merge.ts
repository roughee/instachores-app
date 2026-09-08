/**
 * Pure helpers `SheetsRepo` (#14) uses to fold a poll response into the
 * snapshot (Architecture §3, §6). No IO, no schemas, no Vue.
 */
import type { ChoreEvent } from '@/schemas'

/** Dedupes by id (incoming wins on a collision), sorted by `at`. */
export function mergeEvents(existing: ChoreEvent[], incoming: ChoreEvent[]): ChoreEvent[] {
  const byId = new Map<string, ChoreEvent>()
  for (const e of existing) byId.set(e.id, e)
  for (const e of incoming) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** The largest `loggedAt` across the current cursor and the given events. */
export function nextCursor(current: Date | undefined, events: ChoreEvent[]): Date | undefined {
  let max = current
  for (const e of events) {
    if (max === undefined || e.loggedAt.getTime() > max.getTime()) max = e.loggedAt
  }
  return max
}

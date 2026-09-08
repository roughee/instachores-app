import type { ChoreEvent, EventOf } from '@/schemas'

/**
 * Events that still count: everything except undo events themselves and the
 * events they cancelled. Order is preserved.
 */
export function liveEvents(events: readonly ChoreEvent[]): ChoreEvent[] {
  const undone = new Set<string>()
  for (const e of events) if (e.type === 'undo') undone.add(e.refEventId)
  return events.filter((e) => e.type !== 'undo' && !undone.has(e.id))
}

export function completes(events: readonly ChoreEvent[]): EventOf<'complete'>[] {
  return events.filter((e): e is EventOf<'complete'> => e.type === 'complete')
}

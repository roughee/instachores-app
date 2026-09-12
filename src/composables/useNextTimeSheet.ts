/**
 * Owns the "Next time?" sheet's open/closed state and its payload (Plan
 * §5.5, DESIGN.md §5 NextTimeSheet, issue #69) so `LogScreen` and
 * `CategoryScreen` share one source of truth instead of each carrying its
 * own `ref`. `open` is also where eligibility is decided: never for a
 * `forRole: 'kid'` task (Plan §5.5's "kid tasks never get the sheet"), and
 * otherwise unconditionally -- a task with no `suggestedIntervalDays`
 * (adhoc, no override) still opens the sheet, it just starts with nothing
 * preselected (`NextTimeSheet.vue`'s own concern, not this composable's).
 */
import { ref } from 'vue'
import type { Task } from '@/schemas'

export interface NextTimeSheetPayload {
  /** The task the sheet is for; the parent for a group "Do all". */
  task: Task
  /** The live `complete` event `eventsStore.scheduleNext` will reference. */
  completeEventId: string
  /** What was logged: the task's own points, or the group's summed total. */
  points: number
  memberName: string
  /** Captured from `eventsStore.schedule` before the completion that opened the sheet. */
  lastDoneAt?: Date | undefined
  completedAt: Date
  tz: string
  categoryLabel: string
}

export function useNextTimeSheet() {
  const payload = ref<NextTimeSheetPayload | undefined>(undefined)

  function open(next: NextTimeSheetPayload): void {
    if (next.task.forRole === 'kid') return
    payload.value = next
  }

  function close(): void {
    payload.value = undefined
  }

  return { payload, open, close }
}

export type UseNextTimeSheet = ReturnType<typeof useNextTimeSheet>

import type { Freq, Task } from '@/schemas'
import { DAY_MS } from './time'

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

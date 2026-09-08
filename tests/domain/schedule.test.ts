import { describe, expect, it } from 'vitest'
import { isDue, windowDays } from '@/domain/schedule'
import { NOW, task } from '../helpers/fixtures'

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('schedule', () => {
  it('maps each frequency to a window in days, and adhoc to none', () => {
    expect(windowDays('daily')).toBe(1)
    expect(windowDays('weekly')).toBe(7)
    expect(windowDays('biweekly')).toBe(14)
    expect(windowDays('monthly')).toBe(30)
    expect(windowDays('quarterly')).toBe(90)
    expect(windowDays('adhoc')).toBeNull()
  })

  it('a task is due once its window has passed since the last completion', () => {
    const weekly = task({ freq: 'weekly' })
    expect(isDue(weekly, daysAgo(8), NOW)).toBe(true)
    expect(isDue(weekly, daysAgo(6), NOW)).toBe(false)
  })

  it('a task that was never done is not nagged about', () => {
    expect(isDue(task({ freq: 'daily' }), undefined, NOW)).toBe(false)
  })

  it('adhoc and archived tasks are never due', () => {
    expect(isDue(task({ freq: 'adhoc' }), daysAgo(400), NOW)).toBe(false)
    expect(isDue(task({ freq: 'daily', archived: true }), daysAgo(3), NOW)).toBe(false)
  })
})

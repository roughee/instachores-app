import { describe, expect, it } from 'vitest'
import { dayKey, daysInMonth, shiftDay, startOfDay, startOfMonth, startOfWeek } from '@/domain/time'
import { TZ } from '../helpers/fixtures'

describe('time (household timezone, Monday weeks)', () => {
  it('dayKey uses the household timezone, not UTC', () => {
    // 22:30 UTC on the 9th is already the 10th in Vilnius (UTC+3).
    expect(dayKey(new Date('2026-09-09T22:30:00.000Z'), TZ)).toBe('2026-09-10')
    expect(dayKey(new Date('2026-09-09T22:30:00.000Z'), 'UTC')).toBe('2026-09-09')
  })

  it('startOfDay is local midnight expressed as an instant', () => {
    expect(startOfDay(new Date('2026-09-09T18:00:00.000Z'), TZ).toISOString()).toBe('2026-09-08T21:00:00.000Z')
  })

  it('startOfWeek is Monday 00:00 local for a mid-week instant', () => {
    // Wednesday 2026-09-09 -> Monday 2026-09-07 00:00 EEST = Sunday 21:00 UTC
    expect(startOfWeek(new Date('2026-09-09T18:00:00.000Z'), TZ).toISOString()).toBe('2026-09-06T21:00:00.000Z')
  })

  it('startOfWeek on a Monday just after local midnight stays on that Monday', () => {
    // Monday 2026-09-07 00:30 EEST = Sunday 21:30 UTC
    expect(startOfWeek(new Date('2026-09-06T21:30:00.000Z'), TZ).toISOString()).toBe('2026-09-06T21:00:00.000Z')
  })

  it('startOfWeek holds across the spring DST change (#time-dst)', () => {
    // Vilnius moves from UTC+2 to UTC+3 on Sunday 2026-03-29.
    // Wednesday 2026-04-01 belongs to the week starting Monday 2026-03-30 00:00 EEST.
    expect(startOfWeek(new Date('2026-04-01T12:00:00.000Z'), TZ).toISOString()).toBe('2026-03-29T21:00:00.000Z')
    // Saturday 2026-03-28 belongs to the week starting Monday 2026-03-23 00:00 EET.
    expect(startOfWeek(new Date('2026-03-28T12:00:00.000Z'), TZ).toISOString()).toBe('2026-03-22T22:00:00.000Z')
  })

  it('startOfWeek holds across the autumn DST change', () => {
    // Vilnius moves back to UTC+2 on Sunday 2026-10-25.
    expect(startOfWeek(new Date('2026-10-29T12:00:00.000Z'), TZ).toISOString()).toBe('2026-10-25T22:00:00.000Z')
  })

  it('startOfMonth and daysInMonth follow the local calendar', () => {
    expect(startOfMonth(new Date('2026-09-30T22:30:00.000Z'), TZ).toISOString()).toBe('2026-09-30T21:00:00.000Z')
    expect(daysInMonth(new Date('2026-02-10T12:00:00.000Z'), TZ)).toBe(28)
    expect(daysInMonth(new Date('2028-02-10T12:00:00.000Z'), TZ)).toBe(29)
  })

  it('shiftDay moves a day key by whole days across month ends', () => {
    expect(shiftDay('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })
})

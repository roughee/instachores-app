/**
 * Calendar math in the household's timezone. Pure: every function takes the
 * instant and the zone. Weeks start Monday 00:00 local. No library; Intl does
 * the zone work and the two-step offset correction handles DST edges.
 */

export interface LocalParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Monday ... 6 = Sunday */
  weekday: number
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    formatters.set(tz, f)
  }
  return f
}

export function localParts(d: Date, tz: string): LocalParts {
  const p: Record<string, string> = {}
  for (const part of formatter(tz).formatToParts(d)) p[part.type] = part.value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday ?? 'Mon'] ?? 0,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

/** 'YYYY-MM-DD' of the instant in the household zone. */
export function dayKey(d: Date, tz: string): string {
  const p = localParts(d, tz)
  return keyOf(p.year, p.month, p.day)
}

function offsetMs(d: Date, tz: string): number {
  const p = localParts(d, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - (d.getTime() - d.getMilliseconds())
}

/** The instant of local midnight on the given calendar day in the zone. */
export function localMidnight(year: number, month: number, day: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day)
  const first = guess - offsetMs(new Date(guess), tz)
  const second = guess - offsetMs(new Date(first), tz)
  return new Date(second)
}

export function startOfDay(d: Date, tz: string): Date {
  const p = localParts(d, tz)
  return localMidnight(p.year, p.month, p.day, tz)
}

export function startOfWeek(d: Date, tz: string): Date {
  const p = localParts(d, tz)
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday))
  return localMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), tz)
}

export function startOfMonth(d: Date, tz: string): Date {
  const p = localParts(d, tz)
  return localMidnight(p.year, p.month, 1, tz)
}

export function daysInMonth(d: Date, tz: string): number {
  const p = localParts(d, tz)
  return new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()
}

/** Moves a 'YYYY-MM-DD' key by whole days. Pure calendar arithmetic, no zone needed. */
export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export const DAY_MS = 86_400_000

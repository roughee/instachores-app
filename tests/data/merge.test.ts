import { describe, expect, it } from 'vitest'
import { mergeEvents, nextCursor } from '@/data/merge'
import { ANA, event, task } from '../helpers/fixtures'

function ev(id: string, at: string, loggedAt: string, points = 2) {
  const t = task()
  return event('complete', { id, taskId: t.id, forUid: ANA, points, at: new Date(at), loggedAt: new Date(loggedAt) })
}

describe('mergeEvents', () => {
  it('dedupes by id, incoming wins, sorted by at', () => {
    const existing = [
      ev('ev-1', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:01.000Z'),
      ev('ev-2', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:01.000Z'),
    ]
    const incomingV2 = ev('ev-1', '2026-09-01T00:00:00.000Z', '2026-09-03T00:00:01.000Z', 5)
    const brandNew = ev('ev-3', '2026-09-01T12:00:00.000Z', '2026-09-03T00:00:02.000Z')
    const merged = mergeEvents(existing, [incomingV2, brandNew])

    expect(merged.map((e) => e.id)).toEqual(['ev-1', 'ev-3', 'ev-2'])
    const winner = merged.find((e) => e.id === 'ev-1')
    expect(winner).toBe(incomingV2)
    if (winner?.type === 'complete') expect(winner.points).toBe(5)
  })

  it('returns existing unchanged when incoming is empty', () => {
    const existing = [ev('ev-1', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:01.000Z')]
    expect(mergeEvents(existing, [])).toEqual(existing)
  })

  it('handles both lists empty', () => {
    expect(mergeEvents([], [])).toEqual([])
  })
})

describe('nextCursor', () => {
  it('is the largest loggedAt across current and the incoming events', () => {
    const current = new Date('2026-09-01T00:00:00.000Z')
    const events = [
      ev('ev-1', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
      ev('ev-2', '2026-09-01T00:00:00.000Z', '2026-09-04T00:00:00.000Z'),
      ev('ev-3', '2026-09-01T00:00:00.000Z', '2026-09-03T00:00:00.000Z'),
    ]
    expect(nextCursor(current, events)).toEqual(new Date('2026-09-04T00:00:00.000Z'))
  })

  it('keeps the current cursor when no event is newer', () => {
    const current = new Date('2026-09-10T00:00:00.000Z')
    const events = [ev('ev-1', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')]
    expect(nextCursor(current, events)).toEqual(current)
  })

  it('is undefined when there is no current cursor and no events', () => {
    expect(nextCursor(undefined, [])).toBeUndefined()
  })

  it('picks up the first cursor from events when there was none before', () => {
    const events = [ev('ev-1', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')]
    expect(nextCursor(undefined, events)).toEqual(new Date('2026-09-02T00:00:00.000Z'))
  })
})

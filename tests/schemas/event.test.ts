import { describe, expect, it } from 'vitest'
import { ChoreEvent } from '@/schemas'

const base = {
  v: 1,
  id: 'ev-1',
  actorUid: 'ana',
  at: '2026-09-09T18:00:00.000Z',
  loggedAt: '2026-09-09T18:00:01.000Z',
}

describe('ChoreEvent schema', () => {
  it('narrows on type: a complete needs taskId, forUid and points', () => {
    const ok = ChoreEvent.parse({ ...base, type: 'complete', taskId: 'task-1', forUid: 'ana', points: 2 })
    expect(ok.type).toBe('complete')
    expect(ChoreEvent.safeParse({ ...base, type: 'complete', forUid: 'ana', points: 2 }).success).toBe(false)
  })

  it('rejects an unknown type', () => {
    expect(ChoreEvent.safeParse({ ...base, type: 'delete', refEventId: 'ev-0' }).success).toBe(false)
  })

  it('a kudos is always exactly one point', () => {
    expect(ChoreEvent.safeParse({ ...base, type: 'kudos', refEventId: 'ev-0', points: 1 }).success).toBe(true)
    expect(ChoreEvent.safeParse({ ...base, type: 'kudos', refEventId: 'ev-0', points: 2 }).success).toBe(false)
  })

  it('rejects negative points on a complete and notes longer than 140 characters', () => {
    expect(ChoreEvent.safeParse({ ...base, type: 'complete', taskId: 't', forUid: 'ana', points: -1 }).success).toBe(
      false,
    )
    expect(ChoreEvent.safeParse({ ...base, type: 'undo', refEventId: 'ev-0', note: 'x'.repeat(141) }).success).toBe(
      false,
    )
  })

  it('parses a sheet row where unused columns are empty strings', () => {
    const row = {
      ...base,
      v: '1',
      type: 'bonus',
      note: '',
      taskId: '',
      forUid: 'ana',
      points: '3',
      refEventId: '',
      rewardId: '',
      cost: '',
      combo: 'kitchen-reset',
      day: '2026-09-09',
    }
    const ev = ChoreEvent.parse(row)
    expect(ev.type).toBe('bonus')
    expect(ev.note).toBeUndefined()
    if (ev.type === 'bonus') expect(ev.points).toBe(3)
  })

  it('round-trips a claim through JSON', () => {
    const ev = ChoreEvent.parse({ ...base, type: 'claim', rewardId: 'r-1', forUid: 'ana', cost: 15 })
    expect(ChoreEvent.parse(JSON.parse(JSON.stringify(ev)))).toEqual(ev)
  })
})

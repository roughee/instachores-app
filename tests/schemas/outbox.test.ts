import { describe, expect, it } from 'vitest'
import { OutboxEntry } from '@/schemas'
import { ANA, complete, reward, task } from '../helpers/fixtures'

describe('OutboxEntry schema', () => {
  it('accepts an events.append entry whose payload is a ChoreEvent', () => {
    const t = task()
    const ok = OutboxEntry.safeParse({
      seq: 1,
      kind: 'events.append',
      payload: complete(t),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.enqueuedAt).toBeInstanceOf(Date)
  })

  it('accepts a tasks.upsert entry whose payload is a Task', () => {
    const ok = OutboxEntry.safeParse({
      seq: 2,
      kind: 'tasks.upsert',
      payload: task(),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(ok.success).toBe(true)
  })

  it('accepts a rewards.upsert entry whose payload is a Reward', () => {
    const ok = OutboxEntry.safeParse({
      seq: 3,
      kind: 'rewards.upsert',
      payload: reward(),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(ok.success).toBe(true)
  })

  it('rejects an events.append entry whose payload is a Task, not a ChoreEvent', () => {
    const ok = OutboxEntry.safeParse({
      seq: 1,
      kind: 'events.append',
      payload: task(),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(ok.success).toBe(false)
  })

  it('rejects an unknown kind', () => {
    const ok = OutboxEntry.safeParse({
      seq: 1,
      kind: 'members.upsert',
      payload: task(),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(ok.success).toBe(false)
  })

  it('rejects a negative seq', () => {
    const ok = OutboxEntry.safeParse({
      seq: -1,
      kind: 'tasks.upsert',
      payload: task(),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(ok.success).toBe(false)
  })

  it('coerces a sheet-style numeric seq string', () => {
    const ok = OutboxEntry.safeParse({
      seq: '4',
      kind: 'tasks.upsert',
      payload: task(),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.seq).toBe(4)
  })

  it('round-trips an events.append entry through JSON', () => {
    const entry = OutboxEntry.parse({
      seq: 5,
      kind: 'events.append',
      payload: complete(task(), { forUid: ANA }),
      enqueuedAt: '2026-09-09T18:00:00.000Z',
    })
    expect(OutboxEntry.parse(JSON.parse(JSON.stringify(entry)))).toEqual(entry)
  })
})

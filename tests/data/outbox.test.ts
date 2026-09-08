import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createIdbKvStore } from '@/data/kvStore'
import { Outbox } from '@/data/outbox'
import type { KvStore } from '@/data/kvStore'
import { complete, task } from '../helpers/fixtures'

/** A plain in-memory KvStore, standing in for idb-keyval in tests. */
function memoryStore(): KvStore {
  const map = new Map<string, unknown>()
  return {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value)
    },
    del: async (key) => {
      map.delete(key)
    },
  }
}

describe('Outbox', () => {
  it('flushes pending writes in order, and an entry the confirm did not include stays queued', async () => {
    const outbox = new Outbox(memoryStore())
    const t = task()
    const a = complete(t)
    const b = complete(t)
    const c = complete(t)
    await outbox.enqueue('events.append', a)
    await outbox.enqueue('events.append', b)
    await outbox.enqueue('events.append', c)

    const sentOrder: string[][] = []
    const result = await outbox.flush(async (entries) => {
      sentOrder.push(entries.map((e) => e.payload.id))
      return { confirmedIds: [a.id, c.id] }
    })

    expect(sentOrder).toEqual([[a.id, b.id, c.id]])
    expect(result).toEqual({ sent: 3, confirmed: 2, remaining: 1 })

    const remaining = await outbox.pending()
    expect(remaining.map((e) => e.payload.id)).toEqual([b.id])
  })

  it('flushing twice with the same pending entries sends the same ids and leaves no duplicate after both confirms', async () => {
    const outbox = new Outbox(memoryStore())
    const t = task()
    const a = complete(t)
    const b = complete(t)
    await outbox.enqueue('events.append', a)
    await outbox.enqueue('events.append', b)

    const sentIds: string[][] = []
    const dropConfirm = async (entries: { payload: { id: string } }[]) => {
      sentIds.push(entries.map((e) => e.payload.id))
      return { confirmedIds: [] } // simulates a lost response: nothing acknowledged
    }

    await outbox.flush(dropConfirm)
    await outbox.flush(dropConfirm)
    expect(sentIds).toEqual([
      [a.id, b.id],
      [a.id, b.id],
    ])

    const confirmAll = async (entries: { payload: { id: string } }[]) => ({
      confirmedIds: entries.map((e) => e.payload.id),
    })
    const result = await outbox.flush(confirmAll)
    expect(result).toEqual({ sent: 2, confirmed: 2, remaining: 0 })

    // Flushing again after both are confirmed sends nothing and leaves no duplicate.
    const again = await outbox.flush(confirmAll)
    expect(again).toEqual({ sent: 0, confirmed: 0, remaining: 0 })
    expect(await outbox.pending()).toEqual([])
  })

  it('enqueuing the same payload id twice is a no-op', async () => {
    const outbox = new Outbox(memoryStore())
    const t = task()
    const a = complete(t)
    await outbox.enqueue('events.append', a)
    await outbox.enqueue('events.append', a)
    const pending = await outbox.pending()
    expect(pending).toHaveLength(1)
  })

  it('pending() returns entries in seq order regardless of insertion path', async () => {
    const outbox = new Outbox(memoryStore())
    const t = task()
    const e1 = complete(t)
    const e2 = complete(t)
    const e3 = complete(t)
    await outbox.enqueue('events.append', e1)
    await outbox.enqueue('events.append', e2)
    await outbox.enqueue('events.append', e3)
    const pending = await outbox.pending()
    expect(pending.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(pending.map((e) => e.payload.id)).toEqual([e1.id, e2.id, e3.id])
  })

  it('a flush while another flush is in progress waits for it instead of sending concurrently', async () => {
    const outbox = new Outbox(memoryStore())
    const t = task()
    await outbox.enqueue('events.append', complete(t))
    await outbox.enqueue('tasks.upsert', task())

    let inFlight = 0
    let maxInFlight = 0
    const order: number[] = []
    const send = async (entries: { payload: { id: string } }[]) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push(entries.length)
      inFlight--
      return { confirmedIds: entries.map((e) => e.payload.id) }
    }

    const [r1, r2] = await Promise.all([outbox.flush(send), outbox.flush(send)])
    expect(maxInFlight).toBe(1)
    expect(r1.sent + r2.sent).toBeGreaterThanOrEqual(2)
    expect(await outbox.pending()).toEqual([])
  })

  it('drops a corrupt stored entry with a log, and keeps the rest', async () => {
    const store = memoryStore()
    const log = vi.fn()
    const good = complete(task())
    await store.set('entries', [
      { seq: 1, kind: 'events.append', payload: good, enqueuedAt: '2026-09-09T18:00:00.000Z' },
      { seq: 2, kind: 'events.append', payload: { garbage: true }, enqueuedAt: '2026-09-09T18:00:00.000Z' },
    ])
    const outbox = new Outbox(store, { log })
    const pending = await outbox.pending()
    expect(pending.map((e) => e.payload.id)).toEqual([good.id])
    expect(log).toHaveBeenCalled()
  })

  it('works against the default idb-keyval-backed store', async () => {
    const outbox = new Outbox(createIdbKvStore('outbox-test'))
    const a = complete(task())
    await outbox.enqueue('events.append', a)
    const pending = await outbox.pending()
    expect(pending.map((e) => e.payload.id)).toEqual([a.id])
    const result = await outbox.flush(async (entries) => ({ confirmedIds: entries.map((e) => e.payload.id) }))
    expect(result).toEqual({ sent: 1, confirmed: 1, remaining: 0 })
  })

  it('defaults the log hook to console.warn for a corrupt stored entry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = memoryStore()
    await store.set('entries', [
      { seq: 1, kind: 'events.append', payload: { garbage: true }, enqueuedAt: '2026-09-09T18:00:00.000Z' },
    ])
    const outbox = new Outbox(store)
    expect(await outbox.pending()).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a flush that rejects still lets the next flush run', async () => {
    const outbox = new Outbox(memoryStore())
    const a = complete(task())
    await outbox.enqueue('events.append', a)

    await expect(
      outbox.flush(async () => {
        throw new Error('network down')
      }),
    ).rejects.toThrow('network down')

    const result = await outbox.flush(async (entries) => ({ confirmedIds: entries.map((e) => e.payload.id) }))
    expect(result).toEqual({ sent: 1, confirmed: 1, remaining: 0 })
  })
})

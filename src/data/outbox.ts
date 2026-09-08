/**
 * The ordered outbox of pending writes (Architecture §6). Entries are
 * appended before the store applies a write optimistically, and are removed
 * only once the backend confirms the payload's id. Replay is safe because
 * appends are idempotent by id and upserts carry `updatedAt`.
 */
import { OutboxEntry } from '@/schemas'
import type { OutboxKind } from '@/schemas'
import { createIdbKvStore } from './kvStore'
import type { KvStore } from './kvStore'
import type { RepoLog } from './repo'

const ENTRIES_KEY = 'entries'

type Payload = OutboxEntry['payload']

function payloadId(payload: Payload): string {
  return payload.id
}

export interface FlushResult {
  /** Entries sent to `send` on this call. */
  sent: number
  /** Of those, how many were confirmed and removed. */
  confirmed: number
  /** Entries still pending after this flush. */
  remaining: number
}

const defaultLog: RepoLog = (message, detail) => console.warn(message, detail)

export class Outbox {
  private readonly store: KvStore
  private readonly log: RepoLog
  /** Serializes every read-modify-write (enqueue and flush) so none overlaps. */
  private queue: Promise<unknown> = Promise.resolve()

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn)
    this.queue = result.catch(() => undefined)
    return result
  }

  constructor(store: KvStore = createIdbKvStore('outbox'), options: { log?: RepoLog } = {}) {
    this.store = store
    this.log = options.log ?? defaultLog
  }

  private async readEntries(): Promise<OutboxEntry[]> {
    const raw = await this.store.get(ENTRIES_KEY)
    if (!Array.isArray(raw)) return []
    const out: OutboxEntry[] = []
    for (const row of raw) {
      const r = OutboxEntry.safeParse(row)
      if (r.success) out.push(r.data)
      else this.log('Outbox: dropped a corrupt entry', r.error)
    }
    return out.sort((a, b) => a.seq - b.seq)
  }

  private async writeEntries(entries: OutboxEntry[]): Promise<void> {
    await this.store.set(ENTRIES_KEY, entries)
  }

  /** Enqueuing a payload id already pending is a no-op. */
  enqueue(kind: OutboxKind, payload: Payload): Promise<void> {
    return this.withLock(async () => {
      const entries = await this.readEntries()
      const id = payloadId(payload)
      if (entries.some((e) => payloadId(e.payload) === id)) return
      const seq = entries.reduce((max, e) => Math.max(max, e.seq), 0) + 1
      const entry = OutboxEntry.parse({ seq, kind, payload, enqueuedAt: new Date() })
      await this.writeEntries([...entries, entry])
    })
  }

  /** Pending entries in the order they were enqueued. */
  async pending(): Promise<OutboxEntry[]> {
    return this.readEntries()
  }

  /**
   * Sends every pending entry, oldest first, then removes only the ones
   * whose payload id came back in `confirmedIds`. Enqueues and flushes share
   * one lock, so a tap during a send waits and is never written over.
   */
  flush(send: (entries: OutboxEntry[]) => Promise<{ confirmedIds: string[] }>): Promise<FlushResult> {
    return this.withLock(async () => {
      const entries = await this.readEntries()
      const { confirmedIds } = await send(entries)
      const confirmed = new Set(confirmedIds)
      const remaining = entries.filter((e) => !confirmed.has(payloadId(e.payload)))
      await this.writeEntries(remaining)
      return { sent: entries.length, confirmed: entries.length - remaining.length, remaining: remaining.length }
    })
  }
}

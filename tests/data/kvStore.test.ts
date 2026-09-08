import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createIdbKvStore } from '@/data/kvStore'

describe('createIdbKvStore: every store shares one database (issue #22)', () => {
  it('a store requested after another already exists is still readable and writable, and the first store keeps working', async () => {
    // This is the exact order `main.ts` builds a repo's stores in --
    // `new Outbox()` then `new Snapshot()` -- both backed by the same
    // `homecrew` IndexedDB database. Before this fix, the *second* distinct
    // store name ever requested against that database silently never got
    // created (idb-keyval's own `createStore` only creates the one store its
    // caller asked for, and re-opening an existing database at the same
    // version never re-fires `onupgradeneeded`), so its first read threw a
    // real `NotFoundError` in a browser -- invisible to the other data/
    // tests because each of them only ever requests one store name per file.
    const first = createIdbKvStore('kv-test-first')
    await first.set('a', 1)
    expect(await first.get('a')).toBe(1)

    const second = createIdbKvStore('kv-test-second')
    await second.set('b', 2)
    expect(await second.get('b')).toBe(2)

    await first.set('a', 3)
    expect(await first.get('a')).toBe(3)
    expect(await second.get('b')).toBe(2)
  })
})

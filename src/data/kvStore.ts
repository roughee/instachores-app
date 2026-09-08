/**
 * Minimal async key-value seam so `Outbox` and `Snapshot` can run against a
 * plain `Map` in tests and against IndexedDB (via `idb-keyval`) in the app.
 */
import { createStore, del, get, set } from 'idb-keyval'

export interface KvStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

/** A `KvStore` backed by its own `idb-keyval` object store in the `homecrew` database. */
export function createIdbKvStore(storeName: string): KvStore {
  const store = createStore('homecrew', storeName)
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
  }
}

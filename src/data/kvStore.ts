/**
 * Minimal async key-value seam so `Outbox` and `Snapshot` can run against a
 * plain `Map` in tests and against IndexedDB (via `idb-keyval`) in the app.
 *
 * All `KvStore`s share one IndexedDB database (`homecrew`), so a phone has
 * exactly one to back up -- but idb-keyval's own `createStore(db, storeName)`
 * only creates the *one* object store it is given, in that call's own
 * `onupgradeneeded`. Calling it again for a *second* store name against a
 * database that already exists never re-fires `onupgradeneeded` (no version
 * bump was requested), so that second store silently never gets created; its
 * first read then throws a real `NotFoundError`. This is exactly the order
 * `main.ts` builds a repo's stores in (`new Outbox()` then `new Snapshot()`),
 * and it only ever showed up in a real browser (issue #22) -- every existing
 * `data/` test requests just one store name per file against a fresh
 * `fake-indexeddb`, so two different stores sharing one database was never
 * exercised.
 *
 * The fix: keep one shared connection (`ready`) and, whenever a store name
 * this module has not seen yet is requested, close it and reopen one version
 * higher, creating that store in `onupgradeneeded`. Every `get`/`set`/`del`
 * re-chains onto the current `ready` (never a value captured earlier), so a
 * store opened before a later upgrade never ends up holding a stale, closed
 * connection, and two stores requested back to back serialize onto the same
 * chain instead of racing each other into opening the database twice.
 */
import { del, get, set } from 'idb-keyval'
import type { UseStore } from 'idb-keyval'

export interface KvStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

const DB_NAME = 'homecrew'

let ready: Promise<IDBDatabase> | undefined

function openFresh(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function ensureStore(db: IDBDatabase, storeName: string): Promise<IDBDatabase> {
  if (db.objectStoreNames.contains(storeName)) return Promise.resolve(db)
  db.close()
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, db.version + 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** idb-keyval's `UseStore`: resolves the current, guaranteed-to-exist connection for `storeName` on every call. */
function withStore(storeName: string): UseStore {
  return (txMode, callback) => {
    ready = (ready ?? openFresh()).then((db) => ensureStore(db, storeName))
    return ready.then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)))
  }
}

/** A `KvStore` backed by its own object store in the shared `homecrew` database. */
export function createIdbKvStore(storeName: string): KvStore {
  const store = withStore(storeName)
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
  }
}

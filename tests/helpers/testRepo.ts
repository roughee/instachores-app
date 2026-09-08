/**
 * Store tests (issue #15) run against `MemoryRepo` (docs/Testing.md), never a
 * real `SheetsRepo` or network. `sessionStore.connect`/`resume` need the extra
 * `init`/`start`/`stop` surface `SheetsRepo` has beyond `HouseholdRepo`
 * (`Pollable` in `@/stores/session`); this fake adds no-op versions of those
 * on top of `MemoryRepo` so the session store's orchestration can be tested
 * without IndexedDB or fetch.
 */
import { vi } from 'vitest'
import { MemoryRepo } from '@/data/memoryRepo'
import type { MemoryRepoSeed } from '@/data/repo'
import type { SessionStorage } from '@/stores/session'

export class FakeSheetsRepo extends MemoryRepo {
  readonly init = vi.fn(async () => undefined)
  readonly start = vi.fn()
  readonly stop = vi.fn()

  constructor(seeds: MemoryRepoSeed[] = []) {
    super(seeds)
  }
}

/** A `SessionStorage` backed by a plain `Map`, so tests never touch `localStorage`. */
export function fakeStorage(initial: Record<string, string> = {}): SessionStorage {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

/** A deterministic id source for tests: `id-1`, `id-2`, ... */
export function idCounter(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

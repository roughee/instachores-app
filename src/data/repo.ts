import type { ChoreEvent, Household, Reward, SetupLink, Task } from '@/schemas'

export type Unsubscribe = () => void

export interface SyncResult {
  /** Outbox entries still waiting to be confirmed by the backend. */
  pending: number
  syncedAt: Date
}

export type RepoErrorCode = 'unauthorized' | 'conflict' | 'invalid' | 'locked'

/** Mirrors the Apps Script error codes (Architecture §5). */
export class RepoError extends Error {
  readonly code: RepoErrorCode

  constructor(code: RepoErrorCode, message: string) {
    super(message)
    this.name = 'RepoError'
    this.code = code
  }
}

/**
 * The seam between the app and its storage (Architecture §2, §6).
 * `SheetsRepo` implements this against the Apps Script web app; `MemoryRepo`
 * implements it in memory for store tests and the "Try the demo" path.
 * Nothing above this interface knows which one it has.
 *
 * `watch*` callbacks fire synchronously with the current data on subscribe,
 * and again after every write that changes what they watch.
 */
export interface HouseholdRepo {
  watchHousehold(id: string, cb: (h: Household) => void): Unsubscribe
  watchTasks(id: string, cb: (t: Task[]) => void): Unsubscribe
  watchRewards(id: string, cb: (r: Reward[]) => void): Unsubscribe
  /** Delivers events with `at >= since`, sorted by `at`. */
  watchEvents(id: string, since: Date, cb: (e: ChoreEvent[]) => void): Unsubscribe
  /** Idempotent by `e.id`: appending an id already present is a no-op. */
  appendEvent(id: string, e: ChoreEvent): Promise<void>
  /** Last-write-wins on `updatedAt`; rejects with a `RepoError('conflict', ...)` when the stored row is newer. */
  upsertTask(id: string, t: Task): Promise<void>
  upsertReward(id: string, r: Reward): Promise<void>
  connect(link: SetupLink): Promise<Household>
  sync(): Promise<SyncResult>
}

export type RepoLog = (message: string, detail?: unknown) => void

/**
 * Raw, unparsed seed data for one household, keyed by its id. `MemoryRepo`
 * parses these on every read, so a row shaped wrong (a hand edit gone bad) is
 * skipped and logged instead of throwing.
 */
export interface MemoryRepoSeed {
  id: string
  household: unknown
  tasks?: unknown[]
  rewards?: unknown[]
  events?: unknown[]
}

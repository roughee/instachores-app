/**
 * Runtime configuration for the app-state layer (issue #15): where the
 * session persists, how to build a repo, and where "now" and new ids come
 * from. `main.ts` calls `configureSession` once with the real storage and
 * factories; tests call it with fakes so store tests never touch
 * IndexedDB, `localStorage` or `fetch` (Architecture.md §2, §6).
 *
 * Lives in its own module, separate from `session.ts`, so `catalog.ts` and
 * `events.ts` can read these options without importing the session store
 * itself and creating a module cycle with `session.ts` (which imports every
 * store to wire `bindRepo`).
 */
import type { HouseholdRepo } from '@/data/repo'
import type { SetupLink as SetupLinkT } from '@/schemas'

/** The subset of `Storage` the session needs: get, set, remove. */
export interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * The extra surface `SheetsRepo` has beyond `HouseholdRepo` (Architecture.md
 * §6): loading the last snapshot with no network, and the background
 * poller. Declared here as a structural type rather than added to
 * `HouseholdRepo` itself, so `src/data/repo.ts` does not change for this
 * ticket and `MemoryRepo` (which needs neither) is unaffected.
 */
export interface Pollable {
  /** Loads the last-known state from the snapshot. Safe to call more than once. */
  init(): Promise<void>
  start(): void
  stop(): void
}

export type SheetsRepoLike = HouseholdRepo & Pollable

export function isPollable(repo: HouseholdRepo): repo is SheetsRepoLike {
  const maybe = repo as Partial<Pollable>
  return typeof maybe.init === 'function' && typeof maybe.start === 'function' && typeof maybe.stop === 'function'
}

/** A repo that additionally answers the Apps Script `version` action (Architecture.md §5). */
export interface VersionCapable {
  version(): Promise<string>
}

export function isVersionCapable(repo: HouseholdRepo): repo is HouseholdRepo & VersionCapable {
  return typeof (repo as Partial<VersionCapable>).version === 'function'
}

export interface SessionOptions {
  storage: SessionStorage
  /** Builds a `SheetsRepo` (or a test double) for the given setup link. */
  createSheetsRepo: (link: SetupLinkT) => SheetsRepoLike
  /** Builds a `MemoryRepo` (or a test double) seeded for the demo household. */
  createDemoRepo: (now?: Date) => HouseholdRepo
  now: () => Date
  ids: () => string
}

function notConfigured(): never {
  throw new Error('stores: call configureSession() before using any store (see src/main.ts)')
}

let options: SessionOptions = {
  storage: { getItem: notConfigured, setItem: notConfigured, removeItem: notConfigured },
  createSheetsRepo: notConfigured,
  createDemoRepo: notConfigured,
  now: () => new Date(),
  ids: () => crypto.randomUUID(),
}

/**
 * Sets the injected storage, repo factories, clock and id source. Call once
 * from `main.ts` with the real things, and again in each test's `beforeEach`
 * with fakes. Fields left out keep their default (`now`/`ids`) or the
 * previous call's value (`storage`/the factories), so a test can tweak just
 * `now` between cases without re-supplying the rest.
 */
export function configureSession(next: Partial<SessionOptions>): void {
  options = { ...options, ...next }
}

export function getSessionOptions(): SessionOptions {
  return options
}

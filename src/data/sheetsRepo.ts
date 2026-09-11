/**
 * The real `HouseholdRepo`, talking to the Apps Script web app (Architecture
 * §2, §3, §5, §6). Owns three things: the outbox (writes go there first, the
 * UI never waits on the network), the snapshot (an in-memory copy loaded
 * from IndexedDB so `watch*` calls back synchronously), and a poller that
 * keeps the snapshot fresh while the page is open.
 *
 * `sync()` flushes the outbox (one `events.append` batch, then per-entry
 * upserts), then either polls `events.since` with the stored cursor or
 * re-runs `bootstrap` to refresh the whole catalog, merges the result into
 * the snapshot, and notifies watchers. A sync is one or the other, never
 * both. `locked` and network failures are retried (the outbox entry stays);
 * `conflict` and `invalid` are final (the entry is dropped and the error is
 * surfaced).
 *
 * The catalog refresh (issue #52) runs every 10th `sync()` call, on any sync
 * the poller did not schedule itself (`syncForeground()`, which backs
 * `syncNow()` and the visibility/online handlers), and on the first sync
 * after `init()` finds no household in the snapshot, so a phone that
 * connected before the sheet was seeded, or a resumed session whose
 * snapshot never got a household, catches up on its own.
 */
import { ChoreEvent, Household, Reward, Task } from '@/schemas'
import type {
  ChoreEvent as ChoreEventT,
  Household as HouseholdT,
  Member as MemberT,
  Reward as RewardT,
  SetupLink as SetupLinkT,
  Task as TaskT,
} from '@/schemas'
import type { OutboxEntry } from '@/schemas'
import { z } from 'zod'
import { mergeEvents, nextCursor } from './merge'
import type { Outbox } from './outbox'
import { RepoError } from './repo'
import type { HouseholdRepo, RepoLog, RepoStatus, SkippedRow, SyncResult, Unsubscribe } from './repo'
import { postAction } from './sheetsClient'
import type { Snapshot, SnapshotData } from './snapshot'

/** Timer functions injected so tests can drive the poller with `vi.useFakeTimers()`. */
export interface RepoTimers {
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}

export interface SheetsRepoOptions {
  link: SetupLinkT
  householdId: string
  outbox: Outbox
  snapshot: Snapshot
  fetch?: typeof fetch
  now?: () => Date
  log?: RepoLog
  timers?: RepoTimers
  /** Overrides the poll cadence (default 30s, issue #22): the e2e sync test
   * shortens this via `main.ts`'s dev-only `?pollMs=` flag so a partner's
   * event shows up within one poll instead of waiting on the real interval. */
  pollIntervalMs?: number
}

/** The status shape is the interface's; kept under this name for callers that import it from here. */
export type SheetsRepoStatus = RepoStatus

const POLL_INTERVAL_MS = 30_000
const BACKOFF_INTERVAL_MS = 120_000
const FAILURES_BEFORE_BACKOFF = 3
/** How far back `connect()` bootstraps before the household's timezone is known (Architecture §6). */
const CONNECT_LOOKBACK_MS = 35 * 24 * 60 * 60 * 1000
/** Cadence of the catalog refresh below: every 10th `sync()` call (issue #52). */
const CATALOG_REFRESH_EVERY = 10

const defaultLog: RepoLog = (message, detail) => console.warn(message, detail)

interface RepoState {
  household?: HouseholdT
  tasks: TaskT[]
  rewards: RewardT[]
  events: ChoreEventT[]
  cursor?: Date
}

interface EventWatcher {
  since: Date
  cb: (e: ChoreEventT[]) => void
}

/**
 * Whether a `sync()` call is the poller's own timer tick or something it did
 * not schedule itself (issue #52): `syncForeground()` -- which backs the
 * sync store's `syncNow()` -- a tab becoming visible again, or the browser
 * coming back online. Only `'foreground'` forces a catalog refresh on its
 * own; a `'timer'` sync still refreshes on the 10th call or the first sync
 * with no household.
 */
type SyncTrigger = 'timer' | 'foreground'

interface BootstrapResponse {
  household: unknown
  members: unknown[]
  tasks: unknown[]
  rewards: unknown[]
  events: unknown[]
  serverTime: string
}

type Parsed<T> = { items: T[]; skipped: number; lastSkipped?: SkippedRow }

/** A `bootstrap` answer after every boundary parse (issue #52): shared by `connect()` and `refreshCatalog()`. */
interface ParsedBootstrap {
  household: HouseholdT
  tasks: Parsed<TaskT>
  rewards: Parsed<RewardT>
  events: Parsed<ChoreEventT>
}

interface EventsSinceResponse {
  events: unknown[]
  serverTime: string
}

interface AppendResponse {
  appended: string[]
  skipped: string[]
  loggedAt: string
}

/** Reads `id` off a raw row without trusting its shape otherwise; used only for logging a bad row. */
function rawId(row: unknown): string | undefined {
  if (row && typeof row === 'object' && 'id' in row) {
    const v = (row as { id?: unknown }).id
    return typeof v === 'string' ? v : undefined
  }
  return undefined
}

/**
 * Parses one tab's raw rows against `schema`. `tab` names the Apps Script
 * tab (Architecture §4: `tasks`, `rewards`, `events`) both in the log and in
 * the returned `lastSkipped`, which the Sync panel shows (issue #21, Plan
 * §5.5 Settings) so a hand-edit typo in the sheet is easy to find.
 */
function parseRows<T>(
  schema: z.ZodType<T>,
  rows: unknown[],
  tab: string,
  log: RepoLog,
): { items: T[]; skipped: number; lastSkipped?: SkippedRow } {
  const items: T[] = []
  let skipped = 0
  let lastSkipped: SkippedRow | undefined
  for (const row of rows) {
    const r = schema.safeParse(row)
    if (r.success) items.push(r.data)
    else {
      skipped++
      const id = rawId(row) ?? 'unknown'
      lastSkipped = { tab, id }
      log(`SheetsRepo: skipped a bad row in ${tab}`, { id, error: r.error })
    }
  }
  return { items, skipped, ...(lastSkipped !== undefined && { lastSkipped }) }
}

/** Builds `{ uid: memberRow }` from the members tab's raw rows, keyed by each row's own `uid` cell. */
function buildMembersRecord(rows: unknown[]): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const row of rows) {
    if (row && typeof row === 'object' && 'uid' in row) {
      const uid = (row as { uid?: unknown }).uid
      if (typeof uid === 'string' && uid.length > 0) record[uid] = row
    }
  }
  return record
}

/** Retryable: the entry stays queued. `unauthorized` is retryable too: a rotated
 * secret must not silently drop pending writes; the user re-enters the link. */
function isRetryable(err: unknown): boolean {
  return err instanceof RepoError && (err.code === 'locked' || err.code === 'network' || err.code === 'unauthorized')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class SheetsRepo implements HouseholdRepo {
  private link: SetupLinkT
  private readonly householdId: string
  private readonly outbox: Outbox
  private readonly snapshotStore: Snapshot
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly log: RepoLog
  private readonly timers: RepoTimers
  private readonly pollIntervalMs: number

  private state: RepoState = { tasks: [], rewards: [], events: [] }
  private initPromise: Promise<void> | undefined

  private readonly householdWatchers = new Set<(h: HouseholdT) => void>()
  private readonly taskWatchers = new Set<(t: TaskT[]) => void>()
  private readonly rewardWatchers = new Set<(r: RewardT[]) => void>()
  private readonly eventWatchers = new Set<EventWatcher>()
  private readonly statusWatchers = new Set<(s: SheetsRepoStatus) => void>()

  private status: SheetsRepoStatus

  private timer: ReturnType<typeof setTimeout> | undefined
  private running = false
  private consecutiveFailures = 0

  /** Count of `sync()` calls so far, for the every-10th catalog refresh (issue #52). */
  private syncCount = 0

  constructor(options: SheetsRepoOptions) {
    this.link = options.link
    this.householdId = options.householdId
    this.outbox = options.outbox
    this.snapshotStore = options.snapshot
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? defaultLog
    // Bound to `globalThis` (issue #22): a real browser's `window.setTimeout`/
    // `clearTimeout` are receiver-checked and throw "Illegal invocation" when
    // called as `this.timers.setTimeout(...)` -- detached from the global
    // they were read off. Node's timers tolerate this, which is why it never
    // showed up under Vitest's `environment: 'node'`, only in a real browser.
    this.timers = options.timers ?? {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    }
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS
    this.status = {
      online: true,
      outboxCount: 0,
      lastPollAt: undefined,
      lastError: undefined,
      skippedRows: 0,
      lastSkipped: undefined,
      intervalMs: this.pollIntervalMs,
    }
  }

  /** Loads the last-known state from the snapshot. Safe to call more than once; only the first load runs. */
  init(): Promise<void> {
    this.initPromise ??= this.loadFromSnapshot()
    return this.initPromise
  }

  private async loadFromSnapshot(): Promise<void> {
    const data = await this.snapshotStore.read()
    this.applySnapshotData(data)
  }

  private applySnapshotData(data: SnapshotData): void {
    this.state = {
      ...(data.household !== undefined && { household: data.household }),
      tasks: data.tasks,
      rewards: data.rewards,
      events: data.events,
      ...(data.cursor !== undefined && { cursor: data.cursor }),
    }
    this.status = { ...this.status, skippedRows: this.status.skippedRows + data.skipped }
  }

  private async persist(): Promise<void> {
    const members: MemberT[] = this.state.household ? Object.values(this.state.household.members) : []
    await this.snapshotStore.write({
      ...(this.state.household !== undefined && { household: this.state.household }),
      members,
      tasks: this.state.tasks,
      rewards: this.state.rewards,
      events: this.state.events,
      ...(this.state.cursor !== undefined && { cursor: this.state.cursor }),
    })
  }

  private eventsSinceLocal(since: Date): ChoreEventT[] {
    return this.state.events
      .filter((e) => e.at.getTime() >= since.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime())
  }

  private notifyHousehold(): void {
    if (!this.state.household) return
    for (const cb of this.householdWatchers) cb(this.state.household)
  }

  private notifyTasks(): void {
    for (const cb of this.taskWatchers) cb(this.state.tasks)
  }

  private notifyRewards(): void {
    for (const cb of this.rewardWatchers) cb(this.state.rewards)
  }

  private notifyEvents(): void {
    for (const w of this.eventWatchers) w.cb(this.eventsSinceLocal(w.since))
  }

  private notifyStatus(): void {
    const snapshot = { ...this.status }
    for (const cb of this.statusWatchers) cb(snapshot)
  }

  watchHousehold(_id: string, cb: (h: HouseholdT) => void): Unsubscribe {
    this.householdWatchers.add(cb)
    if (this.state.household) cb(this.state.household)
    return () => this.householdWatchers.delete(cb)
  }

  watchTasks(_id: string, cb: (t: TaskT[]) => void): Unsubscribe {
    this.taskWatchers.add(cb)
    cb(this.state.tasks)
    return () => this.taskWatchers.delete(cb)
  }

  watchRewards(_id: string, cb: (r: RewardT[]) => void): Unsubscribe {
    this.rewardWatchers.add(cb)
    cb(this.state.rewards)
    return () => this.rewardWatchers.delete(cb)
  }

  watchEvents(_id: string, since: Date, cb: (e: ChoreEventT[]) => void): Unsubscribe {
    const watcher: EventWatcher = { since, cb }
    this.eventWatchers.add(watcher)
    cb(this.eventsSinceLocal(since))
    return () => this.eventWatchers.delete(watcher)
  }

  /** The deployed script's version string, shown in the Sync panel. */
  async version(): Promise<string> {
    const res = await postAction<{ version: string }>(this.fetchImpl, this.link.url, this.link.secret, 'version', {})
    return String(res.version)
  }

  /** For the sync store (#15): status of the outbox, the poller and the last poll. */
  watchStatus(cb: (s: SheetsRepoStatus) => void): Unsubscribe {
    this.statusWatchers.add(cb)
    cb({ ...this.status })
    return () => this.statusWatchers.delete(cb)
  }

  private triggerFlush(): void {
    void this.sync().catch((err) => this.log('SheetsRepo: background sync failed', err))
  }

  async appendEvent(_id: string, raw: ChoreEventT): Promise<void> {
    const e = ChoreEvent.parse(raw)
    await this.init()
    await this.outbox.enqueue('events.append', e)
    this.state.events = mergeEvents(this.state.events, [e])
    await this.persist()
    this.notifyEvents()
    this.triggerFlush()
  }

  async upsertTask(_id: string, raw: TaskT): Promise<void> {
    const t = Task.parse(raw)
    await this.init()
    const existing = this.state.tasks.find((row) => row.id === t.id)
    if (existing && existing.updatedAt.getTime() > t.updatedAt.getTime()) {
      throw new RepoError('conflict', `task ${t.id} is behind the stored row`)
    }
    await this.outbox.enqueue('tasks.upsert', t)
    this.state.tasks = existing ? this.state.tasks.map((row) => (row.id === t.id ? t : row)) : [...this.state.tasks, t]
    await this.persist()
    this.notifyTasks()
    this.triggerFlush()
  }

  async upsertReward(_id: string, raw: RewardT): Promise<void> {
    const r = Reward.parse(raw)
    await this.init()
    const existing = this.state.rewards.find((row) => row.id === r.id)
    if (existing && existing.updatedAt.getTime() > r.updatedAt.getTime()) {
      throw new RepoError('conflict', `reward ${r.id} is behind the stored row`)
    }
    await this.outbox.enqueue('rewards.upsert', r)
    this.state.rewards = existing
      ? this.state.rewards.map((row) => (row.id === r.id ? r : row))
      : [...this.state.rewards, r]
    await this.persist()
    this.notifyRewards()
    this.triggerFlush()
  }

  /** Validates the link against `bootstrap`. On success this becomes the repo's state; on `unauthorized` nothing is written. */
  async connect(link: SetupLinkT): Promise<HouseholdT> {
    // A snapshot load still in flight must not overwrite the connected state.
    if (this.initPromise) await this.initPromise.catch(() => undefined)
    const since = new Date(this.now().getTime() - CONNECT_LOOKBACK_MS)
    const res = await postAction<BootstrapResponse>(this.fetchImpl, link.url, link.secret, 'bootstrap', {
      since: since.toISOString(),
    })

    const parsed = this.parseBootstrap(res)
    const cursor = nextCursor(undefined, parsed.events.items)
    this.link = link
    this.state = {
      household: parsed.household,
      tasks: parsed.tasks.items,
      rewards: parsed.rewards.items,
      events: parsed.events.items,
      ...(cursor !== undefined && { cursor }),
    }
    this.initPromise = Promise.resolve()
    this.status = { ...this.status, ...this.skippedAfter(parsed) }
    await this.persist()
    this.notifyAll()
    return parsed.household
  }

  /** Parses a `bootstrap` answer the same way for `connect()` and `refreshCatalog()`: the household throws on a bad row, the tables skip them. */
  private parseBootstrap(res: BootstrapResponse): ParsedBootstrap {
    return {
      household: Household.parse({ ...(res.household as object), members: buildMembersRecord(res.members) }),
      tasks: parseRows(Task, res.tasks, 'tasks', this.log),
      rewards: parseRows(Reward, res.rewards, 'rewards', this.log),
      events: parseRows(ChoreEvent, res.events, 'events', this.log),
    }
  }

  /** Skipped-row bookkeeping for a parsed bootstrap. Events are parsed last, so a bad row there is the "latest" for lastSkipped. */
  private skippedAfter(parsed: ParsedBootstrap): { skippedRows: number; lastSkipped?: SkippedRow } {
    const { tasks, rewards, events } = parsed
    const lastSkipped = events.lastSkipped ?? rewards.lastSkipped ?? tasks.lastSkipped
    return {
      skippedRows: this.status.skippedRows + tasks.skipped + rewards.skipped + events.skipped,
      ...(lastSkipped !== undefined && { lastSkipped }),
    }
  }

  private notifyAll(): void {
    this.notifyHousehold()
    this.notifyTasks()
    this.notifyRewards()
    this.notifyEvents()
    this.notifyStatus()
  }

  private async flushOutbox(): Promise<{ retryable: number; dropped: number; lastError?: string }> {
    let retryable = 0
    let dropped = 0
    let lastError: string | undefined

    await this.outbox.flush(async (entries) => {
      const confirmedIds: string[] = []
      const eventEntries = entries.filter(
        (e): e is Extract<OutboxEntry, { kind: 'events.append' }> => e.kind === 'events.append',
      )
      const upsertEntries = entries.filter((e) => e.kind !== 'events.append')

      if (eventEntries.length > 0) {
        try {
          const res = await postAction<AppendResponse>(
            this.fetchImpl,
            this.link.url,
            this.link.secret,
            'events.append',
            {
              events: eventEntries.map((e) => e.payload),
            },
          )
          confirmedIds.push(...res.appended, ...res.skipped)
        } catch (err) {
          lastError = errorMessage(err)
          if (isRetryable(err)) {
            retryable += eventEntries.length
          } else {
            dropped += eventEntries.length
            this.log('SheetsRepo: dropped an event batch after a final error', err)
            confirmedIds.push(...eventEntries.map((e) => e.payload.id))
          }
        }
      }

      for (const entry of upsertEntries) {
        const action = entry.kind
        const paramKey = action === 'tasks.upsert' ? 'task' : 'reward'
        try {
          await postAction(this.fetchImpl, this.link.url, this.link.secret, action, { [paramKey]: entry.payload })
          confirmedIds.push(entry.payload.id)
        } catch (err) {
          lastError = errorMessage(err)
          if (isRetryable(err)) {
            retryable += 1
          } else {
            dropped += 1
            this.log('SheetsRepo: dropped an outbox entry after a final error', err)
            confirmedIds.push(entry.payload.id)
          }
        }
      }

      return { confirmedIds }
    })

    return { retryable, dropped, ...(lastError !== undefined && { lastError }) }
  }

  private async poll(): Promise<{ pulled: number; lastError?: string }> {
    try {
      const params = this.state.cursor ? { since: this.state.cursor.toISOString() } : {}
      const res = await postAction<EventsSinceResponse>(
        this.fetchImpl,
        this.link.url,
        this.link.secret,
        'events.since',
        params,
      )
      const rows = Array.isArray(res.events) ? res.events : []
      const { items, skipped, lastSkipped } = parseRows(ChoreEvent, rows, 'events', this.log)
      this.state.events = mergeEvents(this.state.events, items)
      const cursor = nextCursor(this.state.cursor, items)
      this.state = { ...this.state, ...(cursor !== undefined && { cursor }) }
      await this.persist()
      this.status = {
        ...this.status,
        online: true,
        lastPollAt: this.now(),
        skippedRows: this.status.skippedRows + skipped,
        ...(lastSkipped !== undefined && { lastSkipped }),
      }
      if (items.length > 0 || skipped > 0) this.notifyEvents()
      return { pulled: items.length }
    } catch (err) {
      const message = errorMessage(err)
      this.status = { ...this.status, online: !(err instanceof RepoError && err.code === 'network') }
      this.log('SheetsRepo: poll failed', err)
      return { pulled: 0, lastError: message }
    }
  }

  /**
   * Re-runs `bootstrap` and merges the result into the snapshot (issue #52):
   * household, tasks and rewards are replaced outright, the same way
   * `connect()` sets them; events are merged and the cursor advanced the
   * same way `poll()` does, since `bootstrap` already returns every event
   * since `since`. This replaces the poll for the sync it runs in.
   *
   * A failed refresh (network, unauthorized, or a household that fails to
   * parse) leaves the current household, tasks and rewards untouched, sets
   * `lastError` and `online` the same way a failed `poll()` does, and never
   * touches the outbox: nothing here is mutated until every row has parsed.
   */
  private async refreshCatalog(): Promise<{ pulled: number; lastError?: string }> {
    try {
      const since = this.state.cursor
        ? this.state.cursor.toISOString()
        : new Date(this.now().getTime() - CONNECT_LOOKBACK_MS).toISOString()
      const res = await postAction<BootstrapResponse>(this.fetchImpl, this.link.url, this.link.secret, 'bootstrap', {
        since,
      })

      const parsed = this.parseBootstrap(res)
      const cursor = nextCursor(this.state.cursor, parsed.events.items)
      this.state = {
        ...this.state,
        household: parsed.household,
        tasks: parsed.tasks.items,
        rewards: parsed.rewards.items,
        events: mergeEvents(this.state.events, parsed.events.items),
        ...(cursor !== undefined && { cursor }),
      }
      await this.persist()
      this.status = { ...this.status, online: true, lastPollAt: this.now(), ...this.skippedAfter(parsed) }
      this.notifyAll()
      return { pulled: parsed.events.items.length }
    } catch (err) {
      const message = errorMessage(err)
      this.status = { ...this.status, online: !(err instanceof RepoError && err.code === 'network') }
      this.log('SheetsRepo: catalog refresh failed', err)
      return { pulled: 0, lastError: message }
    }
  }

  /**
   * Flushes the outbox, then either refreshes the catalog from `bootstrap`
   * or polls `events.since` -- never both (issue #52). The refresh runs
   * every 10th call, on any `'foreground'` trigger (`syncForeground()`,
   * which is not scheduled by the poller's own timer), and on every call
   * while the snapshot still has no household, so a resumed session that
   * never got one keeps trying until a bootstrap succeeds. `trigger`
   * defaults to `'timer'`, the poller's own cadence.
   */
  async sync(trigger: SyncTrigger = 'timer'): Promise<SyncResult> {
    await this.init()
    const flush = await this.flushOutbox()

    this.syncCount += 1
    const dueForCatalogRefresh =
      this.syncCount % CATALOG_REFRESH_EVERY === 0 || trigger === 'foreground' || this.state.household === undefined

    const read = dueForCatalogRefresh ? await this.refreshCatalog() : await this.poll()
    const pending = (await this.outbox.pending()).length
    const lastError = read.lastError ?? flush.lastError

    this.status = { ...this.status, outboxCount: pending, lastError }
    this.notifyStatus()

    return {
      pending,
      syncedAt: this.now(),
      retryable: flush.retryable,
      dropped: flush.dropped,
      pulled: read.pulled,
      ...(lastError !== undefined && { lastError }),
    }
  }

  /**
   * `sync()` with the `'foreground'` trigger (issue #52): always refreshes
   * the catalog. Not part of `HouseholdRepo`, so the interface and
   * `MemoryRepo` are unaffected; `syncStore.syncNow()` calls this instead of
   * `sync()` when the bound repo exposes it (`isForegroundSyncable`).
   */
  async syncForeground(): Promise<SyncResult> {
    return this.sync('foreground')
  }

  // -- Poller: 30s while visible, backoff to 2min after 3 consecutive failures. --------------

  private scheduleNext(): void {
    if (!this.running) return
    this.timer = this.timers.setTimeout(() => {
      void this.tick()
    }, this.status.intervalMs)
  }

  private async tick(trigger: SyncTrigger = 'timer'): Promise<void> {
    const result = await this.sync(trigger)
    if (result.lastError !== undefined) {
      this.consecutiveFailures += 1
      if (this.consecutiveFailures >= FAILURES_BEFORE_BACKOFF) {
        this.status = { ...this.status, intervalMs: BACKOFF_INTERVAL_MS }
      }
    } else {
      this.consecutiveFailures = 0
      this.status = { ...this.status, intervalMs: this.pollIntervalMs }
    }
    this.notifyStatus()
    this.scheduleNext()
  }

  private readonly handleVisibilityChange = (): void => this.onVisible()
  private readonly handleOnline = (): void => this.onOnline()

  /**
   * Starts the recurring poll. Visibility/online listeners attach only where
   * `document`/`window` exist. A snapshot that loaded without a household
   * (issue #52) syncs at once instead of waiting a full interval, so a stuck
   * phone recovers as soon as it opens.
   */
  start(): void {
    if (this.running) return
    this.running = true
    if (this.state.household === undefined) this.pollNow('timer')
    else this.scheduleNext()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleVisibilityChange)
    if (typeof window !== 'undefined') window.addEventListener('online', this.handleOnline)
  }

  stop(): void {
    this.running = false
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer)
      this.timer = undefined
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    if (typeof window !== 'undefined') window.removeEventListener('online', this.handleOnline)
  }

  private pollNow(trigger: SyncTrigger): void {
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer)
      this.timer = undefined
    }
    void this.tick(trigger)
  }

  /** Called on `visibilitychange`; syncs immediately (a foreground trigger, issue #52) when the page just became visible. */
  onVisible(): void {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    this.pollNow('foreground')
  }

  /** Called on the `online` event; syncs immediately (a foreground trigger, issue #52) instead of waiting for the timer. */
  onOnline(): void {
    this.pollNow('foreground')
  }
}

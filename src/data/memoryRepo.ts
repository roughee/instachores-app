/**
 * In-memory `HouseholdRepo` (Architecture §2, §6). Backs every store test and
 * the "Try the demo" path, so it behaves like the real repo: watchers fire
 * synchronously with current data and again after every write, appends are
 * idempotent by id, and upserts respect `updatedAt` last-write-wins.
 *
 * Rows are stored raw (unparsed) and parsed through the schemas on every
 * read, so a row shaped wrong is skipped and logged, never thrown.
 */
import { ChoreEvent, Household, Reward, Task } from '@/schemas'
import type { ChoreEvent as ChoreEventT, Household as HouseholdT, Reward as RewardT, SetupLink, Task as TaskT } from '@/schemas'
import type { z } from 'zod'
import { demoRepoSeed } from './demo'
import { RepoError } from './repo'
import type { HouseholdRepo, MemoryRepoSeed, RepoLog, SyncResult, Unsubscribe } from './repo'

interface HouseholdStore {
  household: unknown
  tasks: unknown[]
  rewards: unknown[]
  events: unknown[]
}

interface EventWatcher {
  since: Date
  cb: (e: ChoreEventT[]) => void
}

/** Reads `id` off a raw row without trusting its shape otherwise. */
function rawId(row: unknown): string | undefined {
  if (row && typeof row === 'object' && 'id' in row) {
    const v = (row as { id?: unknown }).id
    return typeof v === 'string' ? v : undefined
  }
  return undefined
}

const defaultLog: RepoLog = (message, detail) => console.warn(message, detail)

export class MemoryRepo implements HouseholdRepo {
  private readonly stores = new Map<string, HouseholdStore>()
  private readonly householdWatchers = new Map<string, Set<(h: HouseholdT) => void>>()
  private readonly taskWatchers = new Map<string, Set<(t: TaskT[]) => void>>()
  private readonly rewardWatchers = new Map<string, Set<(r: RewardT[]) => void>>()
  private readonly eventWatchers = new Map<string, Set<EventWatcher>>()
  private readonly log: RepoLog
  private demoId: string | undefined

  constructor(seeds: MemoryRepoSeed[] = [], options: { log?: RepoLog } = {}) {
    this.log = options.log ?? defaultLog
    for (const seed of seeds) this.applySeed(seed)
  }

  private applySeed(seed: MemoryRepoSeed): void {
    this.stores.set(seed.id, {
      household: seed.household,
      tasks: seed.tasks ?? [],
      rewards: seed.rewards ?? [],
      events: seed.events ?? [],
    })
    this.demoId ??= seed.id
  }

  private store(id: string): HouseholdStore {
    let s = this.stores.get(id)
    if (!s) {
      s = { household: undefined, tasks: [], rewards: [], events: [] }
      this.stores.set(id, s)
    }
    return s
  }

  private parseHousehold(id: string): HouseholdT | undefined {
    const s = this.stores.get(id)
    if (!s || s.household === undefined) return undefined
    const r = Household.safeParse(s.household)
    if (!r.success) {
      this.log(`MemoryRepo: skipped a bad household row for ${id}`, r.error)
      return undefined
    }
    return r.data
  }

  private parseList<T>(schema: z.ZodType<T>, rows: unknown[], id: string, kind: string): T[] {
    const out: T[] = []
    for (const row of rows) {
      const r = schema.safeParse(row)
      if (r.success) out.push(r.data)
      else this.log(`MemoryRepo: skipped a bad ${kind} row for household ${id}`, r.error)
    }
    return out
  }

  private readTasks(id: string): TaskT[] {
    return this.parseList(Task, this.store(id).tasks, id, 'task')
  }

  private readRewards(id: string): RewardT[] {
    return this.parseList(Reward, this.store(id).rewards, id, 'reward')
  }

  private readEvents(id: string, since?: Date): ChoreEventT[] {
    const parsed = this.parseList(ChoreEvent, this.store(id).events, id, 'event')
    const filtered = since ? parsed.filter((e) => e.at.getTime() >= since.getTime()) : parsed
    return [...filtered].sort((a, b) => a.at.getTime() - b.at.getTime())
  }

  watchHousehold(id: string, cb: (h: HouseholdT) => void): Unsubscribe {
    const set = this.householdWatchers.get(id) ?? new Set()
    this.householdWatchers.set(id, set)
    set.add(cb)
    const h = this.parseHousehold(id)
    if (h) cb(h)
    return () => set.delete(cb)
  }

  watchTasks(id: string, cb: (t: TaskT[]) => void): Unsubscribe {
    const set = this.taskWatchers.get(id) ?? new Set()
    this.taskWatchers.set(id, set)
    set.add(cb)
    cb(this.readTasks(id))
    return () => set.delete(cb)
  }

  watchRewards(id: string, cb: (r: RewardT[]) => void): Unsubscribe {
    const set = this.rewardWatchers.get(id) ?? new Set()
    this.rewardWatchers.set(id, set)
    set.add(cb)
    cb(this.readRewards(id))
    return () => set.delete(cb)
  }

  watchEvents(id: string, since: Date, cb: (e: ChoreEventT[]) => void): Unsubscribe {
    const set = this.eventWatchers.get(id) ?? new Set()
    this.eventWatchers.set(id, set)
    const sub: EventWatcher = { since, cb }
    set.add(sub)
    cb(this.readEvents(id, since))
    return () => set.delete(sub)
  }

  async appendEvent(id: string, e: ChoreEventT): Promise<void> {
    const s = this.store(id)
    if (s.events.some((row) => rawId(row) === e.id)) return
    s.events.push(e)
    const subs = this.eventWatchers.get(id)
    if (subs) for (const sub of subs) sub.cb(this.readEvents(id, sub.since))
  }

  async upsertTask(id: string, t: TaskT): Promise<void> {
    const s = this.store(id)
    const existingRaw = s.tasks.find((row) => rawId(row) === t.id)
    if (existingRaw !== undefined) {
      const existing = Task.safeParse(existingRaw)
      if (existing.success && existing.data.updatedAt.getTime() > t.updatedAt.getTime()) {
        throw new RepoError('conflict', `task ${t.id} is behind the stored row`)
      }
      s.tasks = s.tasks.map((row) => (rawId(row) === t.id ? t : row))
    } else {
      s.tasks = [...s.tasks, t]
    }
    const list = this.readTasks(id)
    this.taskWatchers.get(id)?.forEach((cb) => cb(list))
  }

  async upsertReward(id: string, r: RewardT): Promise<void> {
    const s = this.store(id)
    const existingRaw = s.rewards.find((row) => rawId(row) === r.id)
    if (existingRaw !== undefined) {
      const existing = Reward.safeParse(existingRaw)
      if (existing.success && existing.data.updatedAt.getTime() > r.updatedAt.getTime()) {
        throw new RepoError('conflict', `reward ${r.id} is behind the stored row`)
      }
      s.rewards = s.rewards.map((row) => (rawId(row) === r.id ? r : row))
    } else {
      s.rewards = [...s.rewards, r]
    }
    const list = this.readRewards(id)
    this.rewardWatchers.get(id)?.forEach((cb) => cb(list))
  }

  async connect(_link: SetupLink): Promise<HouseholdT> {
    const id = this.demoId
    if (!id) throw new RepoError('invalid', 'no household seeded to connect to')
    const h = this.parseHousehold(id)
    if (!h) throw new RepoError('invalid', 'the seeded household failed to parse')
    return h
  }

  async sync(): Promise<SyncResult> {
    return { pending: 0, syncedAt: new Date() }
  }
}

/** The "Try the demo" entry point: a `MemoryRepo` pre-seeded with the demo household. */
export function createDemoRepo(now: Date = new Date(), options: { log?: RepoLog } = {}): MemoryRepo {
  return new MemoryRepo([demoRepoSeed(now)], options)
}

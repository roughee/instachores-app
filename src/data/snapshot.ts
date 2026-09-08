/**
 * The last-known household, members, tasks, rewards and events, plus the
 * poll cursor, in IndexedDB (Architecture §6). Loaded on startup before any
 * network call, so the app opens with data offline. Every element goes
 * through the schemas on read; a row that fails to parse is skipped and
 * counted, never thrown.
 */
import { ChoreEvent, Household, Member, Reward, Task } from '@/schemas'
import type {
  ChoreEvent as ChoreEventT,
  Household as HouseholdT,
  Member as MemberT,
  Reward as RewardT,
  Task as TaskT,
} from '@/schemas'
import { z } from 'zod'
import { createIdbKvStore } from './kvStore'
import type { KvStore } from './kvStore'
import type { RepoLog } from './repo'

export interface SnapshotData {
  household?: HouseholdT
  members: MemberT[]
  tasks: TaskT[]
  rewards: RewardT[]
  events: ChoreEventT[]
  cursor?: Date
  /** Rows dropped this read because they failed to parse. */
  skipped: number
}

/** What `write` accepts: the same shape, minus the read-only `skipped` count. */
export type SnapshotWrite = Omit<SnapshotData, 'skipped'>

const CursorSchema = z.coerce.date()

const defaultLog: RepoLog = (message, detail) => console.warn(message, detail)

interface ParsedList<T> {
  items: T[]
  skipped: number
}

export class Snapshot {
  private readonly store: KvStore
  private readonly log: RepoLog

  constructor(store: KvStore = createIdbKvStore('snapshot'), options: { log?: RepoLog } = {}) {
    this.store = store
    this.log = options.log ?? defaultLog
  }

  private async readList<T>(schema: z.ZodType<T>, key: string, kind: string): Promise<ParsedList<T>> {
    const raw = await this.store.get(key)
    if (!Array.isArray(raw)) return { items: [], skipped: 0 }
    const items: T[] = []
    let skipped = 0
    for (const row of raw) {
      const r = schema.safeParse(row)
      if (r.success) items.push(r.data)
      else {
        skipped++
        this.log(`Snapshot: dropped a corrupt ${kind} row`, r.error)
      }
    }
    return { items, skipped }
  }

  async read(): Promise<SnapshotData> {
    let skipped = 0

    const householdRaw = await this.store.get('household')
    let household: HouseholdT | undefined
    if (householdRaw !== undefined) {
      const r = Household.safeParse(householdRaw)
      if (r.success) household = r.data
      else {
        skipped++
        this.log('Snapshot: dropped a corrupt household', r.error)
      }
    }

    const members = await this.readList(Member, 'members', 'member')
    const tasks = await this.readList(Task, 'tasks', 'task')
    const rewards = await this.readList(Reward, 'rewards', 'reward')
    const events = await this.readList(ChoreEvent, 'events', 'event')
    skipped += members.skipped + tasks.skipped + rewards.skipped + events.skipped

    const cursorRaw = await this.store.get('cursor')
    let cursor: Date | undefined
    if (cursorRaw !== undefined) {
      const r = CursorSchema.safeParse(cursorRaw)
      if (r.success) cursor = r.data
      else {
        skipped++
        this.log('Snapshot: dropped a corrupt cursor', r.error)
      }
    }

    return {
      ...(household !== undefined && { household }),
      members: members.items,
      tasks: tasks.items,
      rewards: rewards.items,
      events: events.items,
      ...(cursor !== undefined && { cursor }),
      skipped,
    }
  }

  async write(data: SnapshotWrite): Promise<void> {
    if (data.household !== undefined) await this.store.set('household', data.household)
    else await this.store.del('household')
    await this.store.set('members', data.members)
    await this.store.set('tasks', data.tasks)
    await this.store.set('rewards', data.rewards)
    await this.store.set('events', data.events)
    if (data.cursor !== undefined) await this.store.set('cursor', data.cursor)
    else await this.store.del('cursor')
  }
}

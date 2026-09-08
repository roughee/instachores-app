/**
 * Fixtures are built through the Zod schemas (Plan §7.5 rule 6): a fixture can
 * never be a shape the app would reject. Time and ids are explicit so no test
 * depends on the wall clock.
 */
import { ChoreEvent, Household, Reward, Task } from '@/schemas'
import type { ChoreEvent as ChoreEventT, Household as HouseholdT, Reward as RewardT, Task as TaskT } from '@/schemas'

export const TZ = 'Europe/Vilnius'
export const HID = 'hh-test'
/** Wednesday 2026-09-09 21:00 in Vilnius (UTC+3). */
export const NOW = new Date('2026-09-09T18:00:00.000Z')

export const ANA = 'ana'
export const BEN = 'ben'
export const MIA = 'mia'

let seq = 0
export const nextId = (prefix = 'id') => `${prefix}-${++seq}`

export function household(overrides: Partial<HouseholdT> = {}): HouseholdT {
  return Household.parse({
    v: 1,
    id: HID,
    name: 'Home',
    weeklyTarget: 250,
    tz: TZ,
    members: {
      [ANA]: { uid: ANA, name: 'Ana', color: '#1f8a70', role: 'adult' },
      [BEN]: { uid: BEN, name: 'Ben', color: '#3f6fd4', role: 'adult' },
      [MIA]: { uid: MIA, name: 'Mia', color: '#c9508c', role: 'kid' },
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  })
}

export function task(overrides: Partial<TaskT> = {}): TaskT {
  return Task.parse({
    v: 1,
    id: nextId('task'),
    name: 'Pots',
    category: 'kitchen',
    points: 2,
    freq: 'daily',
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: ANA,
    ...overrides,
  })
}

export function reward(overrides: Partial<RewardT> = {}): RewardT {
  return Reward.parse({
    v: 1,
    id: nextId('reward'),
    name: 'Long bath',
    cost: 15,
    kind: 'solo',
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: ANA,
    ...overrides,
  })
}

type EventOf<T extends ChoreEventT['type']> = Extract<ChoreEventT, { type: T }>

function base(at: Date | string) {
  const d = typeof at === 'string' ? new Date(at) : at
  return { v: 1 as const, id: nextId('ev'), actorUid: ANA, at: d, loggedAt: d }
}

export function complete(t: TaskT, overrides: Partial<EventOf<'complete'>> = {}): EventOf<'complete'> {
  return ChoreEvent.parse({
    ...base(NOW),
    type: 'complete',
    taskId: t.id,
    forUid: ANA,
    points: t.points,
    ...overrides,
  }) as EventOf<'complete'>
}

export function event<T extends ChoreEventT['type']>(
  type: T,
  fields: Omit<EventOf<T>, 'v' | 'id' | 'type' | 'actorUid' | 'at' | 'loggedAt'> &
    Partial<Pick<EventOf<T>, 'id' | 'actorUid' | 'at' | 'loggedAt'>>,
): EventOf<T> {
  return ChoreEvent.parse({ ...base(NOW), type, ...fields }) as EventOf<T>
}

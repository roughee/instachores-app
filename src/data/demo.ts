/**
 * The demo household for the "Try the demo" path: two adults, one kid, the
 * full task catalog and the full reward list, built from the same seed the
 * real app ships with (Architecture §2, §6).
 */
import { seedRewards, seedTasks } from '@/domain/seed'
import { Household } from '@/schemas'
import type { Household as HouseholdT, Reward as RewardT, Task as TaskT } from '@/schemas'
import type { MemoryRepoSeed } from './repo'

export const DEMO_HOUSEHOLD_ID = 'hh-demo'

export interface DemoHousehold {
  household: HouseholdT
  tasks: TaskT[]
  rewards: RewardT[]
}

export function buildDemoHousehold(now: Date): DemoHousehold {
  const household = Household.parse({
    v: 1,
    id: DEMO_HOUSEHOLD_ID,
    name: 'Demo Home',
    weeklyTarget: 250,
    tz: 'Europe/Vilnius',
    members: {
      ana: { uid: 'ana', name: 'Ana', color: '#1f8a70', role: 'adult' },
      ben: { uid: 'ben', name: 'Ben', color: '#3f6fd4', role: 'adult' },
      mia: { uid: 'mia', name: 'Mia', color: '#c9508c', role: 'kid' },
    },
    createdAt: now,
  })
  return { household, tasks: seedTasks(now, 'ana'), rewards: seedRewards(now, 'ana') }
}

/** Raw seed data ready for `new MemoryRepo([demoRepoSeed(now)])`. */
export function demoRepoSeed(now: Date): MemoryRepoSeed {
  const { household, tasks, rewards } = buildDemoHousehold(now)
  return { id: DEMO_HOUSEHOLD_ID, household, tasks, rewards, events: [] }
}

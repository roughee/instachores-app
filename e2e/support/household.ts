/**
 * A minimal, valid household for `MockSheet` (issue #22): two adults, one
 * kid, and just the three tasks the quick row shows before it has learned
 * anything (`DEFAULT_QUICK_ROW` in `src/domain/seed.ts`) -- enough for the
 * Log, Today and Overview screens to render real data without needing the
 * full ~70-row catalog.
 */
import { SEED_IDS } from '@/domain/seed'
import type { RawRow } from './mockSheet'

export const ANA = 'ana'
export const BEN = 'ben'
export const MIA = 'mia'

export const MEMBERS: RawRow[] = [
  { uid: ANA, name: 'Ana', color: '#128369', role: 'adult' },
  { uid: BEN, name: 'Ben', color: '#3f6fd4', role: 'adult' },
  { uid: MIA, name: 'Mia', color: '#c9508c', role: 'kid' },
]

const UPDATED_AT = '2026-01-01T00:00:00.000Z'

function task(id: string, name: string, points: number, sort: number): RawRow {
  return {
    v: 1,
    id,
    name,
    category: 'kitchen',
    points,
    freq: 'daily',
    forRole: 'adult',
    archived: false,
    sort,
    updatedAt: UPDATED_AT,
    updatedBy: 'system',
  }
}

/** `DEFAULT_QUICK_ROW` order: Pots, Clean kitchen counters, Take out trash. */
export const TASKS: RawRow[] = [
  task(SEED_IDS.pots, 'Pots', 2, 0),
  task(SEED_IDS.counters, 'Clean kitchen counters', 3, 1),
  task(SEED_IDS.trash, 'Take out trash / recycling', 2, 2),
]

/**
 * A minimal, valid household for `MockSheet` (issue #22): two adults, one
 * kid, the three tasks the quick row shows before it has learned anything
 * (`DEFAULT_QUICK_ROW` in `src/domain/seed.ts`), and the Clean bathroom
 * group (issue #72, `e2e/schedule-flow.spec.ts`) -- a combo-bonus parent
 * with its four sub-items, in the same shape `src/domain/seed.ts` gives it
 * (`SEED_IDS.cleanBathroom`'s row: `comboBonus: 2, intervalDays: 7`).
 * Enough for the Log, Today, Overview and Schedule screens to render real
 * data without needing the full ~70-row catalog.
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

function task(id: string, name: string, points: number, sort: number, extra: Partial<RawRow> = {}): RawRow {
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
    ...extra,
  }
}

/** A bathroom-category, weekly task -- `task()` with the two fields the
 * Clean bathroom group needs overridden. */
function bathroomTask(id: string, name: string, points: number, sort: number, extra: Partial<RawRow> = {}): RawRow {
  return task(id, name, points, sort, { category: 'bathroom', freq: 'weekly', ...extra })
}

/** `DEFAULT_QUICK_ROW` order: Pots, Clean kitchen counters, Take out trash. */
export const TASKS: RawRow[] = [
  task(SEED_IDS.pots, 'Pots', 2, 0),
  task(SEED_IDS.counters, 'Clean kitchen counters', 3, 1),
  task(SEED_IDS.trash, 'Take out trash / recycling', 2, 2),
  // Clean bathroom group (issue #72): a comboBonus parent (0 points of its
  // own) plus its four active sub-items, sort-ordered the same way
  // `src/domain/seed.ts` orders them, so "Do all" completes them in that
  // order and the last one (drain) is the one "Next time?" references.
  bathroomTask(SEED_IDS.cleanBathroom, 'Clean bathroom', 0, 3, { comboBonus: 2, intervalDays: 7 }),
  bathroomTask(SEED_IDS.toilet, 'Toilet', 4, 4, { parentId: SEED_IDS.cleanBathroom }),
  bathroomTask(SEED_IDS.bathSink, 'Sink + mirror + counter', 2, 5, { parentId: SEED_IDS.cleanBathroom }),
  bathroomTask(SEED_IDS.shower, 'Shower / tub', 4, 6, { parentId: SEED_IDS.cleanBathroom }),
  bathroomTask(SEED_IDS.drain, 'Clear shower drain', 4, 7, { parentId: SEED_IDS.cleanBathroom }),
]

import type { Category, ChoreEvent, EventOf, Task } from '@/schemas'
import { completes, liveEvents } from './events'
import { comboBonusId } from './ids'
import { SEED_IDS } from './seed'
import { dayKey } from './time'

/** A combo is satisfied when every group has at least one completed task that day. */
export interface ComboDef {
  key: string
  name: string
  category: Category
  bonus: number
  groups: string[][]
}

/** Plan §3: hand-wash (pots or pans) + counters + trash + dishwasher loaded, same day. */
export const KITCHEN_RESET: ComboDef = {
  key: 'kitchen-reset',
  name: 'Kitchen Reset',
  category: 'kitchen',
  bonus: 3,
  groups: [[SEED_IDS.pots, SEED_IDS.pans], [SEED_IDS.counters], [SEED_IDS.trash], [SEED_IDS.dishwasherLoad]],
}

/** Group tasks: a parent with `comboBonus` requires every active sub-item. */
export function combosFromTasks(tasks: readonly Task[]): ComboDef[] {
  const out: ComboDef[] = []
  for (const parent of tasks) {
    if (parent.comboBonus === undefined || parent.archived) continue
    const children = tasks.filter((t) => t.parentId === parent.id && !t.archived)
    if (children.length === 0) continue
    out.push({
      key: parent.id,
      name: parent.name,
      category: parent.category,
      bonus: parent.comboBonus,
      groups: children.map((c) => [c.id]),
    })
  }
  return out
}

export function allCombos(tasks: readonly Task[]): ComboDef[] {
  return [KITCHEN_RESET, ...combosFromTasks(tasks)]
}

export interface DetectInput {
  events: readonly ChoreEvent[]
  tasks: readonly Task[]
  /** 'YYYY-MM-DD' in the household zone. */
  day: string
  tz: string
  hid: string
  /** The phone emitting the bonus. */
  actorUid: string
  now: Date
  combos?: readonly ComboDef[]
}

/** The bonus to whoever completed most of the combo; ties go to the last completer. */
function creditTo(done: EventOf<'complete'>[]): string {
  const counts = new Map<string, number>()
  let last = done[0]!
  for (const c of done) {
    counts.set(c.forUid, (counts.get(c.forUid) ?? 0) + 1)
    if (c.at.getTime() >= last.at.getTime()) last = c
  }
  let best = last.forUid
  for (const [uid, n] of counts) if (n > (counts.get(best) ?? 0)) best = uid
  return best
}

/**
 * Bonus events that should be appended for `day`: one per satisfied combo whose
 * deterministic id is not already present. Undone completes do not count.
 */
export function detectCombos(input: DetectInput): EventOf<'bonus'>[] {
  const defs = input.combos ?? allCombos(input.tasks)
  const existing = new Set(input.events.filter((e) => e.type === 'bonus').map((e) => e.id))
  const today = completes(liveEvents(input.events)).filter((c) => dayKey(c.at, input.tz) === input.day)
  const out: EventOf<'bonus'>[] = []
  for (const def of defs) {
    const satisfied = def.groups.every((group) => today.some((c) => group.includes(c.taskId)))
    if (!satisfied) continue
    const id = comboBonusId(def.key, input.day, input.hid)
    if (existing.has(id)) continue
    const involved = new Set(def.groups.flat())
    out.push({
      v: 1,
      id,
      type: 'bonus',
      actorUid: input.actorUid,
      at: input.now,
      loggedAt: input.now,
      forUid: creditTo(today.filter((c) => involved.has(c.taskId))),
      points: def.bonus,
      combo: def.key,
      day: input.day,
    })
  }
  return out
}

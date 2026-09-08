import { describe, expect, it } from 'vitest'
import { KITCHEN_RESET, combosFromTasks, detectCombos } from '@/domain/combos'
import { comboBonusId } from '@/domain/ids'
import { SEED_IDS, seedTasks } from '@/domain/seed'
import { ANA, BEN, HID, NOW, TZ, complete, event, task } from '../helpers/fixtures'

const tasks = seedTasks(NOW, ANA)
const byId = (id: string) => {
  const t = tasks.find((x) => x.id === id)
  if (!t) throw new Error(`no seed task ${id}`)
  return t
}
const day = '2026-09-09'
const detect = (events: Parameters<typeof detectCombos>[0]['events'], extra = {}) =>
  detectCombos({ events, tasks, day, tz: TZ, hid: HID, actorUid: ANA, now: NOW, ...extra })

describe('Kitchen Reset combo', () => {
  it('pots + counters + trash + dishwasher loaded on the same day emit one +3 bonus with a deterministic id', () => {
    const events = [
      complete(byId(SEED_IDS.pots)),
      complete(byId(SEED_IDS.counters)),
      complete(byId(SEED_IDS.trash)),
      complete(byId(SEED_IDS.dishwasherLoad)),
    ]
    const bonuses = detect(events)
    expect(bonuses).toHaveLength(1)
    const b = bonuses[0]!
    expect(b.type).toBe('bonus')
    if (b.type !== 'bonus') return
    expect(b.points).toBe(KITCHEN_RESET.bonus)
    expect(b.combo).toBe(KITCHEN_RESET.key)
    expect(b.day).toBe(day)
    expect(b.id).toBe(comboBonusId(KITCHEN_RESET.key, day, HID))
  })

  it('is not satisfied when trash is missing', () => {
    const events = [
      complete(byId(SEED_IDS.pots)),
      complete(byId(SEED_IDS.counters)),
      complete(byId(SEED_IDS.dishwasherLoad)),
    ]
    expect(detect(events)).toHaveLength(0)
  })

  it('accepts pans in place of pots for the hand-wash group', () => {
    const events = [
      complete(byId(SEED_IDS.pans)),
      complete(byId(SEED_IDS.counters)),
      complete(byId(SEED_IDS.trash)),
      complete(byId(SEED_IDS.dishwasherLoad)),
    ]
    expect(detect(events)).toHaveLength(1)
  })

  it('emits nothing when the bonus for that day already exists (idempotent across two phones)', () => {
    const events = [
      complete(byId(SEED_IDS.pots)),
      complete(byId(SEED_IDS.counters)),
      complete(byId(SEED_IDS.trash)),
      complete(byId(SEED_IDS.dishwasherLoad)),
      event('bonus', {
        id: comboBonusId(KITCHEN_RESET.key, day, HID),
        forUid: ANA,
        points: 3,
        combo: KITCHEN_RESET.key,
        day,
      }),
    ]
    expect(detect(events)).toHaveLength(0)
  })

  it('credits the bonus to whoever did most of the combo', () => {
    const events = [
      complete(byId(SEED_IDS.pots), { forUid: BEN }),
      complete(byId(SEED_IDS.counters), { forUid: BEN }),
      complete(byId(SEED_IDS.trash), { forUid: BEN }),
      complete(byId(SEED_IDS.dishwasherLoad), { forUid: ANA }),
    ]
    const b = detect(events)[0]!
    if (b.type === 'bonus') expect(b.forUid).toBe(BEN)
  })

  it('ignores completes that were undone and completes from another day', () => {
    const pots = complete(byId(SEED_IDS.pots))
    const events = [
      pots,
      event('undo', { refEventId: pots.id }),
      complete(byId(SEED_IDS.pans), { at: new Date('2026-09-08T18:00:00.000Z') }),
      complete(byId(SEED_IDS.counters)),
      complete(byId(SEED_IDS.trash)),
      complete(byId(SEED_IDS.dishwasherLoad)),
    ]
    expect(detect(events)).toHaveLength(0)
  })
})

describe('group task combos (parent with comboBonus)', () => {
  it('derives a combo from a parent task that requires every active sub-item', () => {
    const parent = task({ id: 'bath', name: 'Clean bathroom', category: 'bathroom', points: 0, comboBonus: 2 })
    const toilet = task({ id: 'toilet', parentId: 'bath', points: 4 })
    const sink = task({ id: 'sink', parentId: 'bath', points: 2 })
    const old = task({ id: 'old', parentId: 'bath', points: 1, archived: true })
    const combos = combosFromTasks([parent, toilet, sink, old])
    expect(combos).toEqual([
      { key: 'bath', name: 'Clean bathroom', category: 'bathroom', bonus: 2, groups: [['toilet'], ['sink']] },
    ])
  })

  it('emits the parent bonus when all sub-items are done the same day', () => {
    const parent = task({ id: 'bath', name: 'Clean bathroom', category: 'bathroom', points: 0, comboBonus: 2 })
    const toilet = task({ id: 'toilet', parentId: 'bath', points: 4 })
    const sink = task({ id: 'sink', parentId: 'bath', points: 2 })
    const local = [parent, toilet, sink]
    const events = [complete(toilet), complete(sink)]
    const bonuses = detectCombos({ events, tasks: local, day, tz: TZ, hid: HID, actorUid: ANA, now: NOW })
    expect(bonuses).toHaveLength(1)
    if (bonuses[0]!.type === 'bonus') expect(bonuses[0]!.points).toBe(2)
  })
})

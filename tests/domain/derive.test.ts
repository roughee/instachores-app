import { describe, expect, it } from 'vitest'
import { deriveState } from '@/domain/derive'
import { SEED_IDS, seedRewards, seedTasks } from '@/domain/seed'
import type { ChoreEvent, Task } from '@/schemas'
import { ANA, BEN, MIA, NOW, complete, event, household, reward, task } from '../helpers/fixtures'

const h = household()
const tasks = seedTasks(NOW, ANA)
const rewards = seedRewards(NOW, ANA)
const seed = (id: string) => tasks.find((t) => t.id === id)!
const derive = (events: ChoreEvent[], extra: { tasks?: Task[]; rewards?: typeof rewards; now?: Date } = {}) =>
  deriveState({ events, tasks: extra.tasks ?? tasks, rewards: extra.rewards ?? rewards, household: h, now: extra.now ?? NOW })

const at = (iso: string) => new Date(iso)

describe('balances', () => {
  it('a complete adds its snapshotted points to forUid', () => {
    const d = derive([complete(seed(SEED_IDS.pots), { forUid: BEN, points: 2 })])
    expect(d.balances[BEN]).toBe(2)
    expect(d.balances[ANA]).toBe(0)
  })

  it('an undo gives its referenced event zero points', () => {
    const c = complete(seed(SEED_IDS.pots))
    expect(derive([c, event('undo', { refEventId: c.id })]).balances[ANA]).toBe(0)
  })

  it('a kudos adds one point to the completer and is idempotent per actor', () => {
    const c = complete(seed(SEED_IDS.pots), { forUid: ANA })
    const clap = event('kudos', { refEventId: c.id, points: 1, actorUid: BEN })
    const again = event('kudos', { refEventId: c.id, points: 1, actorUid: BEN })
    expect(derive([c, clap, again]).balances[ANA]).toBe(3)
  })

  it('bonus and adjust events move the balance; adjust may be negative', () => {
    const d = derive([
      event('bonus', { forUid: ANA, points: 3, combo: 'kitchen-reset', day: '2026-09-09' }),
      event('adjust', { forUid: ANA, points: -1, note: 'logged twice by mistake' }),
    ])
    expect(d.balances[ANA]).toBe(2)
  })

  it('kid tasks accrue stars, never adult points', () => {
    const kidTask = seed(SEED_IDS.kidToys)
    const d = derive([complete(kidTask, { forUid: MIA, points: 1 })])
    expect(d.stars[MIA]).toBe(1)
    expect(d.balances[MIA]).toBeUndefined()
    expect(d.balances[ANA]).toBe(0)
  })
})

describe('claims', () => {
  const bath = reward({ id: 'bath', cost: 15, kind: 'solo' })
  const earn = () => complete(seed(SEED_IDS.cookDinner), { forUid: ANA, points: 20 })

  it('a claim does not change the balance and shows as pending', () => {
    const claim = event('claim', { rewardId: bath.id, forUid: ANA, cost: 15 })
    const d = derive([earn(), claim], { rewards: [bath] })
    expect(d.balances[ANA]).toBe(20)
    expect(d.pendingClaims).toEqual([{ claimId: claim.id, rewardId: bath.id, forUid: ANA, cost: 15, at: claim.at }])
  })

  it('an ack by the other adult deducts the cost from forUid', () => {
    const claim = event('claim', { rewardId: bath.id, forUid: ANA, cost: 15 })
    const ack = event('ack', { refEventId: claim.id, actorUid: BEN })
    const d = derive([earn(), claim, ack], { rewards: [bath] })
    expect(d.balances[ANA]).toBe(5)
    expect(d.pendingClaims).toEqual([])
  })

  it('a user cannot ack their own claim', () => {
    const claim = event('claim', { rewardId: bath.id, forUid: ANA, cost: 15, actorUid: ANA })
    const selfAck = event('ack', { refEventId: claim.id, actorUid: ANA })
    const d = derive([earn(), claim, selfAck], { rewards: [bath] })
    expect(d.balances[ANA]).toBe(20)
    expect(d.pendingClaims).toHaveLength(1)
  })

  it('a decline clears the claim and refunds nothing because nothing was taken', () => {
    const claim = event('claim', { rewardId: bath.id, forUid: ANA, cost: 15 })
    const d = derive([earn(), claim, event('decline', { refEventId: claim.id, actorUid: BEN })], { rewards: [bath] })
    expect(d.balances[ANA]).toBe(20)
    expect(d.pendingClaims).toEqual([])
  })

  it('a pooled reward is paid from both adults evenly, remainder on the claimant', () => {
    const sitter = reward({ id: 'sitter', cost: 21, kind: 'pooled' })
    const claim = event('claim', { rewardId: sitter.id, forUid: ANA, cost: 21 })
    const d = derive(
      [
        complete(seed(SEED_IDS.cookDinner), { forUid: ANA, points: 30 }),
        complete(seed(SEED_IDS.cookDinner), { forUid: BEN, points: 30 }),
        claim,
        event('ack', { refEventId: claim.id, actorUid: BEN }),
      ],
      { rewards: [sitter] },
    )
    expect(d.balances[ANA]).toBe(19)
    expect(d.balances[BEN]).toBe(20)
    expect(d.pooled).toBe(39)
  })
})

describe('rollups', () => {
  it('the week starts Monday 00:00 household-local; earlier events are excluded', () => {
    const inWeek = complete(seed(SEED_IDS.pots), { at: at('2026-09-06T21:00:00.000Z') }) // Mon 00:00 EEST
    const lastWeek = complete(seed(SEED_IDS.pots), { at: at('2026-09-06T20:59:59.000Z') })
    const d = derive([inWeek, lastWeek])
    expect(d.week.household).toBe(2)
    expect(d.month.household).toBe(4)
  })

  it('category totals sum to member totals', () => {
    const d = derive([
      complete(seed(SEED_IDS.pots), { forUid: ANA }),
      complete(seed(SEED_IDS.vacuumAll), { forUid: BEN }),
      complete(seed(SEED_IDS.trash), { forUid: BEN }),
      event('bonus', { forUid: BEN, points: 3, combo: 'kitchen-reset', day: '2026-09-09' }),
    ])
    const memberTotal = Object.values(d.week.byMember).reduce((s, m) => s + m.points, 0)
    const categoryTotal = Object.values(d.week.byCategory).reduce(
      (s, per) => s + Object.values(per).reduce((a, b) => a + b, 0),
      0,
    )
    expect(memberTotal).toBe(categoryTotal)
    expect(d.week.byCategory.kitchen?.[BEN]).toBe(5)
    expect(d.week.byMember[BEN]?.count).toBe(2)
  })

  it('the week target is the household target and the month target is pro-rated by days', () => {
    const d = derive([])
    expect(d.week.target).toBe(250)
    expect(d.month.target).toBe(Math.round((250 * 30) / 7))
  })

  it('combos in the period are counted by name', () => {
    const d = derive([
      event('bonus', { forUid: ANA, points: 3, combo: 'kitchen-reset', day: '2026-09-08' }),
      event('bonus', { forUid: BEN, points: 3, combo: 'kitchen-reset', day: '2026-09-09' }),
    ])
    expect(d.week.combos).toEqual([{ name: 'kitchen-reset', count: 2 }])
  })
})

describe('counters heat strip and streak', () => {
  const counters = seed(SEED_IDS.counters)
  const onDay = (iso: string) => complete(counters, { at: at(iso) })

  it('the heat strip covers the last 7 local days ending today', () => {
    const d = derive([onDay('2026-09-09T10:00:00.000Z'), onDay('2026-09-06T10:00:00.000Z')])
    expect(d.heatStrip.map((x) => x.day)).toEqual([
      '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09',
    ])
    expect(d.heatStrip.filter((x) => x.countersDone).map((x) => x.day)).toEqual(['2026-09-06', '2026-09-09'])
  })

  it('the streak counts consecutive days ending today', () => {
    const d = derive([onDay('2026-09-07T10:00:00.000Z'), onDay('2026-09-08T10:00:00.000Z'), onDay('2026-09-09T10:00:00.000Z')])
    expect(d.streaks.countersClean).toBe(3)
  })

  it('a streak survives until the end of today when today is not yet logged', () => {
    const d = derive([onDay('2026-09-07T10:00:00.000Z'), onDay('2026-09-08T10:00:00.000Z')])
    expect(d.streaks.countersClean).toBe(2)
  })

  it('a missed day resets the streak', () => {
    const d = derive([onDay('2026-09-06T10:00:00.000Z'), onDay('2026-09-07T10:00:00.000Z')])
    expect(d.streaks.countersClean).toBe(0)
  })
})

describe('quick row and due dots', () => {
  it('shows the three seeded defaults before anything has been logged', () => {
    expect(derive([]).quickRow.map((t) => t.id)).toEqual([SEED_IDS.pots, SEED_IDS.counters, SEED_IDS.trash])
  })

  it('learns the top three tasks by completions in the last 14 days, filling with defaults', () => {
    const events = [
      complete(seed(SEED_IDS.bottles)),
      complete(seed(SEED_IDS.bottles)),
      complete(seed(SEED_IDS.trash)),
      complete(seed(SEED_IDS.vacuumAll), { at: at('2026-08-01T10:00:00.000Z') }),
    ]
    expect(derive(events).quickRow.map((t) => t.id)).toEqual([SEED_IDS.bottles, SEED_IDS.trash, SEED_IDS.pots])
  })

  it('never puts kid or archived tasks in the quick row', () => {
    const gone = task({ id: 'gone', archived: true })
    const events = [complete(gone), complete(gone), complete(seed(SEED_IDS.kidToys), { forUid: MIA })]
    const row = derive(events, { tasks: [...tasks, gone] }).quickRow
    expect(row.some((t) => t.id === 'gone' || t.forRole === 'kid')).toBe(false)
  })

  it('flags a category when one of its tasks is past its window', () => {
    const d = derive([complete(seed(SEED_IDS.vacuumAll), { at: at('2026-08-20T10:00:00.000Z') })])
    expect(d.dueDots.floors).toBe(true)
    expect(d.dueDots.kitchen).toBe(false)
  })
})

describe('seed data', () => {
  it('every seeded task and reward parses and ids are unique', () => {
    const ids = [...tasks.map((t) => t.id), ...rewards.map((r) => r.id)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(tasks.length).toBeGreaterThan(50)
    expect(tasks.filter((t) => t.forRole === 'kid').length).toBe(5)
  })

  it('sub-items point at an existing parent', () => {
    const idSet = new Set(tasks.map((t) => t.id))
    for (const t of tasks) if (t.parentId) expect(idSet.has(t.parentId)).toBe(true)
  })
})

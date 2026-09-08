/**
 * Everything the screens show is a pure function of the event list. This file
 * owns the points rules; nothing else in the app may add or subtract points.
 */
import { Category } from '@/schemas'
import type { ChoreEvent, EventOf, Household, Reward, Task } from '@/schemas'
import { allCombos } from './combos'
import { completes, liveEvents } from './events'
import { isDue } from './schedule'
import { DEFAULT_QUICK_ROW, SEED_IDS } from './seed'
import { DAY_MS, dayKey, daysInMonth, shiftDay, startOfMonth, startOfWeek } from './time'

export interface Rollup {
  household: number
  target: number
  byMember: Record<string, { points: number; count: number }>
  byCategory: Partial<Record<Category, Record<string, number>>>
  combos: { name: string; count: number }[]
}

export interface PendingClaim {
  claimId: string
  rewardId: string
  forUid: string
  cost: number
  at: Date
}

export interface Derived {
  /** Adult points: complete + kudos + bonus + adjust, minus acknowledged claims. */
  balances: Record<string, number>
  /** Kid stars, kept apart from the adult economy. */
  stars: Record<string, number>
  /** What is available for pooled rewards: the sum of adult balances. */
  pooled: number
  week: Rollup
  month: Rollup
  pendingClaims: PendingClaim[]
  streaks: { countersClean: number }
  /** The last 7 local days ending today. */
  heatStrip: { day: string; countersDone: boolean }[]
  quickRow: Task[]
  dueDots: Record<Category, boolean>
}

export interface DeriveInput {
  events: readonly ChoreEvent[]
  tasks: readonly Task[]
  rewards: readonly Reward[]
  household: Household
  now: Date
  keyTasks?: { counters: string; quickDefaults: readonly string[] }
}

const QUICK_ROW_WINDOW_DAYS = 14

export function deriveState(input: DeriveInput): Derived {
  const { events, tasks, rewards, household, now } = input
  const tz = household.tz
  const keys = input.keyTasks ?? { counters: SEED_IDS.counters, quickDefaults: DEFAULT_QUICK_ROW }
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const rewardById = new Map(rewards.map((r) => [r.id, r]))
  const adults = Object.values(household.members)
    .filter((m) => m.role === 'adult')
    .map((m) => m.uid)
  const isKidTask = (taskId: string) => taskById.get(taskId)?.forRole === 'kid'

  const live = [...liveEvents(events)].sort((a, b) => a.at.getTime() - b.at.getTime())
  const done = completes(live)
  const completeById = new Map(done.map((c) => [c.id, c]))

  // Balances and stars.
  const balances: Record<string, number> = Object.fromEntries(adults.map((uid) => [uid, 0]))
  const stars: Record<string, number> = {}
  const add = (uid: string, points: number) => {
    balances[uid] = (balances[uid] ?? 0) + points
  }
  const kudosSeen = new Set<string>()
  const claims = new Map<string, EventOf<'claim'>>()
  const acks: EventOf<'ack'>[] = []
  const declines: EventOf<'decline'>[] = []
  for (const e of live) {
    switch (e.type) {
      case 'complete':
        if (isKidTask(e.taskId)) stars[e.forUid] = (stars[e.forUid] ?? 0) + e.points
        else add(e.forUid, e.points)
        break
      case 'kudos': {
        const key = `${e.refEventId}:${e.actorUid}`
        const target = completeById.get(e.refEventId)
        if (kudosSeen.has(key) || !target) break
        kudosSeen.add(key)
        add(target.forUid, e.points)
        break
      }
      case 'bonus':
      case 'adjust':
        add(e.forUid, e.points)
        break
      case 'claim':
        claims.set(e.id, e)
        break
      case 'ack':
        acks.push(e)
        break
      case 'decline':
        declines.push(e)
        break
    }
  }

  // Claims: only another adult can acknowledge or decline; points move on ack.
  const pendingClaims: PendingClaim[] = []
  const settledBy = (list: { refEventId: string; actorUid: string }[], claim: EventOf<'claim'>) =>
    list.some((x) => x.refEventId === claim.id && x.actorUid !== claim.actorUid && adults.includes(x.actorUid))
  for (const claim of claims.values()) {
    if (settledBy(acks, claim)) {
      if (rewardById.get(claim.rewardId)?.kind === 'pooled' && adults.length > 0) {
        const share = Math.floor(claim.cost / adults.length)
        for (const uid of adults) add(uid, -share)
        add(claim.forUid, -(claim.cost - share * adults.length))
      } else {
        add(claim.forUid, -claim.cost)
      }
    } else if (!settledBy(declines, claim)) {
      pendingClaims.push({ claimId: claim.id, rewardId: claim.rewardId, forUid: claim.forUid, cost: claim.cost, at: claim.at })
    }
  }
  const pooled = adults.reduce((sum, uid) => sum + (balances[uid] ?? 0), 0)

  // Rollups.
  const comboCategory = new Map(allCombos(tasks).map((c) => [c.key, c.category]))
  const rollup = (start: Date, target: number): Rollup => {
    const byMember: Rollup['byMember'] = {}
    const byCategory: Rollup['byCategory'] = {}
    const comboCounts = new Map<string, number>()
    const credit = (uid: string, category: Category, points: number, isComplete: boolean) => {
      const m = (byMember[uid] ??= { points: 0, count: 0 })
      m.points += points
      if (isComplete) m.count += 1
      const per = (byCategory[category] ??= {})
      per[uid] = (per[uid] ?? 0) + points
    }
    for (const e of live) {
      if (e.at.getTime() < start.getTime()) continue
      if (e.type === 'complete' && !isKidTask(e.taskId)) {
        credit(e.forUid, taskById.get(e.taskId)?.category ?? 'admin', e.points, true)
      } else if (e.type === 'bonus') {
        credit(e.forUid, comboCategory.get(e.combo) ?? 'admin', e.points, false)
        comboCounts.set(e.combo, (comboCounts.get(e.combo) ?? 0) + 1)
      }
    }
    const household = Object.values(byMember).reduce((s, m) => s + m.points, 0)
    const combos = [...comboCounts].map(([name, count]) => ({ name, count }))
    return { household, target, byMember, byCategory, combos }
  }
  const week = rollup(startOfWeek(now, tz), household.weeklyTarget)
  const month = rollup(startOfMonth(now, tz), Math.round((household.weeklyTarget * daysInMonth(now, tz)) / 7))

  // Counters: heat strip and streak.
  const countersDays = new Set(done.filter((c) => c.taskId === keys.counters).map((c) => dayKey(c.at, tz)))
  const today = dayKey(now, tz)
  const heatStrip = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6)
    return { day, countersDone: countersDays.has(day) }
  })
  let streak = 0
  for (let day = countersDays.has(today) ? today : shiftDay(today, -1); countersDays.has(day); day = shiftDay(day, -1)) streak += 1

  // Quick row: top three by completions in the last 14 days, defaults fill the rest.
  const since = now.getTime() - QUICK_ROW_WINDOW_DAYS * DAY_MS
  const counts = new Map<string, number>()
  for (const c of done) {
    if (c.at.getTime() < since) continue
    const t = taskById.get(c.taskId)
    if (!t || t.archived || t.forRole === 'kid') continue
    counts.set(t.id, (counts.get(t.id) ?? 0) + 1)
  }
  const quickRow = [...counts]
    .sort(([aId, aN], [bId, bN]) => bN - aN || (taskById.get(aId)?.sort ?? 0) - (taskById.get(bId)?.sort ?? 0))
    .slice(0, 3)
    .map(([id]) => taskById.get(id)!)
  for (const id of keys.quickDefaults) {
    if (quickRow.length >= 3) break
    const t = taskById.get(id)
    if (t && !quickRow.includes(t)) quickRow.push(t)
  }

  // Due dots: a category lights up when one of its tasks is past its window.
  const lastDone = new Map<string, Date>()
  for (const c of done) {
    const prev = lastDone.get(c.taskId)
    if (!prev || prev.getTime() < c.at.getTime()) lastDone.set(c.taskId, c.at)
  }
  const dueDots = Object.fromEntries(Category.options.map((c) => [c, false])) as Record<Category, boolean>
  for (const t of tasks) {
    if (t.forRole !== 'kid' && isDue(t, lastDone.get(t.id), now)) dueDots[t.category] = true
  }

  return { balances, stars, pooled, week, month, pendingClaims, streaks: { countersClean: streak }, heatStrip, quickRow, dueDots }
}

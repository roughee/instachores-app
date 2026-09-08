/**
 * Events + the derived state screens read (issue #15, Architecture.md §2,
 * §3). Holds the parsed list from `watchEvents(since = start of previous
 * month)`. `complete`/`undo` build a `ChoreEvent`, apply it to local state
 * synchronously (the household bar re-derives before any repo promise
 * resolves), then hand it to the repo. `derived` is `deriveState`'s output
 * over the current events/tasks/rewards/household/now, memoized by Vue's
 * reactivity: nothing here re-computes what the domain already owns.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { HouseholdRepo, Unsubscribe } from '@/data/repo'
import { mergeEvents } from '@/data/merge'
import { detectCombos } from '@/domain/combos'
import { deriveState } from '@/domain/derive'
import type { Derived } from '@/domain/derive'
import { liveEvents } from '@/domain/events'
import { buildToday } from '@/domain/today'
import type { TodayRow, TodayTotals } from '@/domain/today'
import { DAY_MS, dayKey, startOfMonth } from '@/domain/time'
import { Category, ChoreEvent } from '@/schemas'
import type { ChoreEvent as ChoreEventT, EventOf } from '@/schemas'
import { useCatalogStore } from './catalog'
import { useHouseholdStore } from './household'
import { getSessionOptions } from './sessionOptions'

/** Plan §5.5 Log: Undo is offered for 4 s after a tap. */
export const UNDO_WINDOW_MS = 4000

export interface RecentlyLogged {
  eventId: string
  expiresAt: number
}

export interface CompleteOptions {
  forUid?: string
  at?: Date
  note?: string
}

export type UndoResult = { ok: true } | { ok: false; reason: string }

export type { TodayRow, TodayTotals } from '@/domain/today'

function emptyDerived(): Derived {
  const dueDots = Object.fromEntries(Category.options.map((c) => [c, false])) as Record<Category, boolean>
  return {
    balances: {},
    stars: {},
    pooled: 0,
    week: { household: 0, target: 0, byMember: {}, byCategory: {}, combos: [] },
    month: { household: 0, target: 0, byMember: {}, byCategory: {}, combos: [] },
    pendingClaims: [],
    streaks: { countersClean: 0 },
    heatStrip: [],
    quickRow: [],
    dueDots,
  }
}

/** The instant of local midnight on the 1st of the month before `now`'s month. */
function startOfPreviousMonth(now: Date, tz: string): Date {
  const thisMonth = startOfMonth(now, tz)
  return startOfMonth(new Date(thisMonth.getTime() - DAY_MS), tz)
}

export const useEventsStore = defineStore('events', () => {
  const events = ref<ChoreEventT[]>([])
  /** A coarse "now" the app ticks once a minute (bound below) so week/month
   * boundaries roll over without a full re-bind; `complete`/`undo` use the
   * fine-grained injected clock directly instead, for the 4 s undo window. */
  const clockNow = ref<Date>(new Date(0))
  const recentlyLogged = ref<RecentlyLogged | undefined>(undefined)

  let boundRepo: HouseholdRepo | undefined
  let boundHouseholdId: string | undefined
  let unsubscribe: Unsubscribe | undefined
  let ticker: ReturnType<typeof setInterval> | undefined

  function bind(repo: HouseholdRepo, householdId: string, opts: { tz: string; now: () => Date }): void {
    unbind()
    boundRepo = repo
    boundHouseholdId = householdId
    clockNow.value = opts.now()
    const since = startOfPreviousMonth(clockNow.value, opts.tz)
    unsubscribe = repo.watchEvents(householdId, since, (list) => {
      events.value = list
    })
    ticker = setInterval(() => {
      clockNow.value = opts.now()
    }, 60_000)
  }

  function unbind(): void {
    unsubscribe?.()
    unsubscribe = undefined
    if (ticker !== undefined) {
      clearInterval(ticker)
      ticker = undefined
    }
    boundRepo = undefined
    boundHouseholdId = undefined
    recentlyLogged.value = undefined
    events.value = []
  }

  /** The single source of truth for every number on screen (Architecture.md §2): the domain's output, not re-derived here. */
  const derived = computed<Derived>(() => {
    const householdStore = useHouseholdStore()
    const catalogStore = useCatalogStore()
    if (!householdStore.household) return emptyDerived()
    return deriveState({
      events: events.value,
      tasks: catalogStore.tasks,
      rewards: catalogStore.rewards,
      household: householdStore.household,
      now: clockNow.value,
    })
  })

  /** "You today" (Plan §5.5 Log): today's complete points credited to the
   * current member, adult tasks only (a kid task's points go to `stars`,
   * not this member's own point total). */
  const youToday = computed<number>(() => {
    const householdStore = useHouseholdStore()
    const catalogStore = useCatalogStore()
    const member = householdStore.currentMember
    if (!member || !householdStore.household) return 0
    const tz = householdStore.household.tz
    const today = dayKey(clockNow.value, tz)
    let total = 0
    for (const e of liveEvents(events.value)) {
      if (e.type !== 'complete' || e.forUid !== member.uid) continue
      if (dayKey(e.at, tz) !== today) continue
      if (catalogStore.byId.get(e.taskId)?.forRole === 'kid') continue
      total += e.points
    }
    return total
  })

  /** Who completed each task today, for the avatar dots on `TaskButton` /
   * `CategoryTile` (DESIGN.md §5): one uid per completion, so a task done
   * twice by the same member has that uid twice. */
  const doneTodayByTask = computed<Map<string, string[]>>(() => {
    const householdStore = useHouseholdStore()
    const map = new Map<string, string[]>()
    if (!householdStore.household) return map
    const tz = householdStore.household.tz
    const today = dayKey(clockNow.value, tz)
    for (const e of liveEvents(events.value)) {
      if (e.type !== 'complete') continue
      if (dayKey(e.at, tz) !== today) continue
      const list = map.get(e.taskId)
      if (list) list.push(e.forUid)
      else map.set(e.taskId, [e.forUid])
    }
    return map
  })

  function applyLocal(e: ChoreEventT): void {
    events.value = mergeEvents(events.value, [e])
  }

  /** The Today screen's feed (Plan §5.5 `#/today`): `buildToday`'s output over
   * the current events/tasks/household/now, the same domain-first shape as
   * `derived` above, so the two screens can never disagree on a total. */
  const today = computed(() => {
    const householdStore = useHouseholdStore()
    const catalogStore = useCatalogStore()
    if (!householdStore.household)
      return { rows: [] as TodayRow[], totals: { household: 0, byMember: {} } as TodayTotals }
    return buildToday({
      events: events.value,
      tasks: catalogStore.tasks,
      household: householdStore.household,
      now: clockNow.value,
    })
  })

  const todayRows = computed<TodayRow[]>(() => today.value.rows)
  const todayTotals = computed<TodayTotals>(() => today.value.totals)

  /** Runs combo detection for `day` against the events applied so far and applies any new bonus locally. */
  function detectAndApplyBonuses(day: string, actorUid: string, at: Date): EventOf<'bonus'>[] {
    const householdStore = useHouseholdStore()
    const catalogStore = useCatalogStore()
    if (!householdStore.household || !boundHouseholdId) return []
    const bonuses = detectCombos({
      events: events.value,
      tasks: catalogStore.tasks,
      day,
      tz: householdStore.household.tz,
      hid: boundHouseholdId,
      actorUid,
      now: at,
    })
    for (const b of bonuses) applyLocal(b)
    return bonuses
  }

  /**
   * Builds one `complete` event for `taskId` at the task's current points,
   * credited to the current member (or `opts.forUid`), applies it (and any
   * combo bonus it completes) to local state in this tick, then appends
   * both to the repo. The household bar reflects the change before the
   * `appendEvent` promise settles: nothing here awaits before the local apply.
   */
  async function complete(taskId: string, opts: CompleteOptions = {}): Promise<void> {
    if (!boundRepo || !boundHouseholdId) throw new Error('events.complete: no household connected')
    const catalogStore = useCatalogStore()
    const householdStore = useHouseholdStore()
    const task = catalogStore.byId.get(taskId)
    if (!task) throw new Error(`events.complete: unknown task ${taskId}`)
    const actorUid = householdStore.currentMember?.uid
    if (!actorUid) throw new Error('events.complete: no current member to credit')
    if (!householdStore.household) throw new Error('events.complete: household not loaded')
    const forUid = opts.forUid ?? actorUid

    const sessionOpts = getSessionOptions()
    const at = opts.at ?? sessionOpts.now()
    const id = sessionOpts.ids()
    const raw: Record<string, unknown> = {
      v: 1,
      id,
      type: 'complete',
      actorUid,
      at,
      loggedAt: at,
      taskId,
      forUid,
      points: task.points,
    }
    if (opts.note !== undefined) raw.note = opts.note
    const ev = ChoreEvent.parse(raw) as EventOf<'complete'>

    applyLocal(ev)
    recentlyLogged.value = { eventId: ev.id, expiresAt: at.getTime() + UNDO_WINDOW_MS }
    const day = dayKey(at, householdStore.household.tz)
    const bonuses = detectAndApplyBonuses(day, actorUid, at)

    const repo = boundRepo
    const hid = boundHouseholdId
    await repo.appendEvent(hid, ev)
    for (const b of bonuses) await repo.appendEvent(hid, b)
  }

  /**
   * Appends an `undo` referencing `eventId` while its 4 s window (from the
   * local `loggedAt`) is still open. Outside the window, or for an event
   * this phone never logged, this is a no-op that says why.
   */
  function undo(eventId: string): UndoResult {
    const recent = recentlyLogged.value
    if (!recent || recent.eventId !== eventId) {
      return { ok: false, reason: 'no open undo window for this event' }
    }
    const sessionOpts = getSessionOptions()
    const now = sessionOpts.now()
    if (now.getTime() > recent.expiresAt) {
      recentlyLogged.value = undefined
      return { ok: false, reason: 'the undo window has closed' }
    }
    if (!boundRepo || !boundHouseholdId) return { ok: false, reason: 'no household connected' }
    const householdStore = useHouseholdStore()
    const actorUid = householdStore.currentMember?.uid
    if (!actorUid) return { ok: false, reason: 'no current member' }

    const id = sessionOpts.ids()
    const ev = ChoreEvent.parse({
      v: 1,
      id,
      type: 'undo',
      actorUid,
      at: now,
      loggedAt: now,
      refEventId: eventId,
    }) as EventOf<'undo'>

    applyLocal(ev)
    recentlyLogged.value = undefined
    void boundRepo.appendEvent(boundHouseholdId, ev)
    return { ok: true }
  }

  return {
    events,
    recentlyLogged,
    derived,
    youToday,
    doneTodayByTask,
    todayRows,
    todayTotals,
    bind,
    unbind,
    complete,
    undo,
  }
})

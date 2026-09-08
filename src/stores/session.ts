/**
 * The composition root (issue #15, Architecture.md §2, §7). Holds which repo
 * this phone is talking to, which household and member it is, and whether
 * it is in demo, sheets or disconnected mode. `bindRepo` is the one place
 * that (re)wires every other store's watchers to a repo; nothing else does.
 *
 * `configureSession`/`getSessionOptions` live in `./sessionOptions` (not
 * here) so `catalog.ts`/`events.ts` can read them without importing this
 * module and creating a cycle with it importing every store back for
 * `bindRepo`. Both are re-exported here as the one import site the rest of
 * the app (`main.ts`, tests) uses.
 */
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { HouseholdRepo } from '@/data/repo'
import { Session } from '@/schemas'
import type { Household as HouseholdT, SetupLink as SetupLinkT } from '@/schemas'
import { useCatalogStore } from './catalog'
import { useEventsStore } from './events'
import { useHouseholdStore } from './household'
import { getSessionOptions, isPollable } from './sessionOptions'
import { useSyncStore } from './sync'

export { configureSession, getSessionOptions, isPollable, isVersionCapable } from './sessionOptions'
export type { Pollable, SessionOptions, SessionStorage, SheetsRepoLike, VersionCapable } from './sessionOptions'

export const SESSION_STORAGE_KEY = 'homecrew.session'

export type SessionMode = 'demo' | 'sheets' | 'disconnected'

/** The setup link demo mode connects with; `MemoryRepo.connect` ignores its contents, but the schema still requires a well-shaped one. */
const DEMO_LINK: SetupLinkT = { url: 'https://demo.invalid/exec', secret: 'demo-mode-secret' }

export const useSessionStore = defineStore('session', () => {
  const repo = shallowRef<HouseholdRepo | null>(null)
  const householdId = ref<string | null>(null)
  const memberUid = ref<string | null>(null)
  const mode = ref<SessionMode>('disconnected')

  /** Resolves once `resume()` has settled, whatever the outcome (issue #16,
   * Architecture.md §7). The router guard awaits this before deciding
   * whether to redirect, so a phone that is already connected never flashes
   * the Welcome screen while the stored session is still loading. */
  let markReady: () => void = () => {}
  const ready: Promise<void> = new Promise((resolve) => {
    markReady = resolve
  })

  /** (Re)wires household/catalog/events/sync to `next`, unsubscribing whatever they were bound to before. */
  function bindRepo(next: HouseholdRepo, id: string): void {
    const householdStore = useHouseholdStore()
    householdStore.bind(next, id)
    useCatalogStore().bind(next, id)
    const tz = householdStore.household?.tz ?? 'UTC'
    useEventsStore().bind(next, id, { tz, now: getSessionOptions().now })
    useSyncStore().bind(next)
    repo.value = next
    householdId.value = id
  }

  function unbindRepo(): void {
    useHouseholdStore().unbind()
    useCatalogStore().unbind()
    useEventsStore().unbind()
    useSyncStore().unbind()
    repo.value = null
    householdId.value = null
  }

  /** "Try the demo" (Plan §5.5 Welcome): a seeded `MemoryRepo`, first adult as the member, never touches storage. */
  async function startDemo(now?: Date): Promise<void> {
    const opts = getSessionOptions()
    const demo = opts.createDemoRepo(now ?? opts.now())
    const household = await demo.connect(DEMO_LINK)
    const firstAdult = Object.values(household.members).find((m) => m.role === 'adult')
    if (!firstAdult) throw new Error('session.startDemo: the demo household has no adult member')
    bindRepo(demo, household.id)
    memberUid.value = firstAdult.uid
    mode.value = 'demo'
    // A demo boot never calls resume(); the router guard waits on `ready`.
    markReady()
  }

  /**
   * Bootstraps a setup link far enough to see its members (issue #16, Plan
   * §5.5 Welcome): builds a `SheetsRepo` and calls `connect()` on it, but
   * does not bind it to the other stores or persist a session -- that only
   * happens once a member is chosen, via `connect()` below. Lets the Welcome
   * screen show "Who are you?" before committing this phone to anyone.
   */
  async function preview(link: SetupLinkT): Promise<HouseholdT> {
    const opts = getSessionOptions()
    const sheetsRepo = opts.createSheetsRepo(link)
    return sheetsRepo.connect(link)
  }

  /** Connects a real household by setup link (Plan §5.5 Welcome, Architecture.md §7): builds the SheetsRepo, bootstraps, persists the session, starts the poller. */
  async function connect(link: SetupLinkT, uid: string): Promise<void> {
    const opts = getSessionOptions()
    const sheetsRepo = opts.createSheetsRepo(link)
    const household = await sheetsRepo.connect(link)
    if (!(uid in household.members)) throw new Error(`session.connect: ${uid} is not a member of this household`)
    bindRepo(sheetsRepo, household.id)
    memberUid.value = uid
    mode.value = 'sheets'
    markReady()
    const session = Session.parse({ v: 1, link, householdId: household.id, memberUid: uid })
    opts.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    sheetsRepo.start()
  }

  /** Resumes a previously connected household from storage with no network call; returns whether one was stored. */
  async function resume(): Promise<boolean> {
    try {
      const opts = getSessionOptions()
      const raw = opts.storage.getItem(SESSION_STORAGE_KEY)
      if (raw === null) return false
      let parsed: Session
      try {
        parsed = Session.parse(JSON.parse(raw))
      } catch {
        return false
      }
      const sheetsRepo = opts.createSheetsRepo(parsed.link)
      await sheetsRepo.init()
      bindRepo(sheetsRepo, parsed.householdId)
      memberUid.value = parsed.memberUid
      mode.value = 'sheets'
      sheetsRepo.start()
      return true
    } finally {
      markReady()
    }
  }

  /** Stops the poller, unbinds every store and clears the stored session. */
  function disconnect(): void {
    const opts = getSessionOptions()
    if (repo.value && isPollable(repo.value)) repo.value.stop()
    unbindRepo()
    memberUid.value = null
    mode.value = 'disconnected'
    opts.storage.removeItem(SESSION_STORAGE_KEY)
  }

  return { repo, householdId, memberUid, mode, ready, startDemo, preview, connect, resume, disconnect }
})

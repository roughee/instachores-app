import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createAppRouter } from './router'
import { readPollIntervalMs } from './composables/usePwa'
import { Outbox } from './data/outbox'
import { createDemoRepo } from './data/memoryRepo'
import { SheetsRepo } from './data/sheetsRepo'
import { Snapshot } from './data/snapshot'
import { SEED_IDS } from './domain/seed'
import { DAY_MS } from './domain/time'
import type { SetupLink as SetupLinkT } from './schemas'
import { configureSession, useSessionStore } from './stores/session'
import type { SheetsRepoLike } from './stores/session'
import { useEventsStore } from './stores/events'
import { useSyncStore } from './stores/sync'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'

/** `householdId` is a construction-time placeholder: `SheetsRepo` never reads
 * it back (every call takes its own `id` parameter); the real household id,
 * once known from `connect()`/`resume()`, lives in the session store.
 * `?pollMs=` (issue #22) is a dev-only override for the e2e sync test, read
 * once here so both a fresh `connect()` and a `resume()` pick it up. */
function createSheetsRepo(link: SetupLinkT): SheetsRepoLike {
  const pollIntervalMs = readPollIntervalMs()
  return new SheetsRepo({
    link,
    householdId: '',
    outbox: new Outbox(),
    snapshot: new Snapshot(),
    ...(pollIntervalMs !== undefined && { pollIntervalMs }),
  })
}

configureSession({
  storage: window.localStorage,
  createSheetsRepo,
  createDemoRepo: (now) => createDemoRepo(now),
})

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(createAppRouter())
app.mount('#app')

/**
 * Dev-only query flags for deterministic screenshots (issue #17, matching
 * the `forceUpdateToast`/`forceInstallCard` pattern in usePwa.ts): `?demo=1`
 * starts the demo household with no network, `?demoLogs=N` then completes
 * the first N quick-row tasks, and `?forceOffline=1` (with `?demoOutbox=N`)
 * fakes the sync store's status so the offline banner renders without a
 * real dropped connection (`MemoryRepo` has no network to lose). Harmless
 * in production: nobody links to the app with these params. Issue #18's
 * Today screen reuses `demoLogs` as-is: any completed quick-row task shows
 * up there too.
 *
 * Issue #16 adds the router guard for a missing session; absent `?demo=1`
 * this only resumes a session that already exists, so a refresh does not
 * drop back to Welcome.
 *
 * `?demoSchedule=1` (issue #68) additionally puts three Schedule-tab tasks
 * through "Next time?" for deterministic Schedule screenshots: Clean
 * bathroom and Vacuum whole home get a fresh completion followed by a 3-day
 * and a 7-day schedule (both land `away`); Wet-mop floors is completed 5
 * days ago (through `complete`'s own `opts.at` backdating, same path as a
 * real backdated log) with a 5-day schedule, so its due day is today. Dev
 * only, like the flags above.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  if (params.get('demo') !== '1') {
    void useSessionStore().resume()
    return
  }
  await useSessionStore().startDemo()
  const logsWanted = Number(params.get('demoLogs') ?? '0')
  if (logsWanted > 0) {
    const eventsStore = useEventsStore()
    for (const t of eventsStore.derived.quickRow.slice(0, logsWanted)) await eventsStore.complete(t.id)
  }
  if (params.get('demoSchedule') === '1') {
    const eventsStore = useEventsStore()
    const scheduleAfterCompleting = async (taskId: string, days: number, opts: { at?: Date } = {}) => {
      await eventsStore.complete(taskId, opts)
      const completeEventId = eventsStore.recentlyLogged?.eventId
      if (completeEventId) await eventsStore.scheduleNext(completeEventId, days)
    }
    await scheduleAfterCompleting(SEED_IDS.cleanBathroom, 3)
    await scheduleAfterCompleting(SEED_IDS.vacuumAll, 7)
    await scheduleAfterCompleting(SEED_IDS.mop, 5, { at: new Date(Date.now() - 5 * DAY_MS) })
  }
  if (params.get('forceOffline') === '1') {
    useSyncStore().$patch({ online: false, outboxCount: Number(params.get('demoOutbox') ?? '3') })
  }
}

void boot()

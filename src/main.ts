import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createAppRouter } from './router'
import { Outbox } from './data/outbox'
import { createDemoRepo } from './data/memoryRepo'
import { SheetsRepo } from './data/sheetsRepo'
import { Snapshot } from './data/snapshot'
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
 * once known from `connect()`/`resume()`, lives in the session store. */
function createSheetsRepo(link: SetupLinkT): SheetsRepoLike {
  return new SheetsRepo({ link, householdId: '', outbox: new Outbox(), snapshot: new Snapshot() })
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
 * in production: nobody links to the app with these params.
 *
 * Issue #16 adds the router guard for a missing session; absent `?demo=1`
 * this only resumes a session that already exists, so a refresh does not
 * drop back to Welcome.
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
  if (params.get('forceOffline') === '1') {
    useSyncStore().$patch({ online: false, outboxCount: Number(params.get('demoOutbox') ?? '3') })
  }
}

void boot()

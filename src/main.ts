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

// Issue #16 adds the router guard for a missing session; this only restores
// one that already exists so a refresh does not drop back to Welcome.
void useSessionStore().resume()

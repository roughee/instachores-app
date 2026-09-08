/**
 * Hash routes (Plan §5.5): GitHub Pages has no server-side rewrites, so a
 * refresh on any deep link must resolve client-side from the URL fragment.
 *
 * `routes` is exported on its own, separate from `createAppRouter`, so
 * tests can assert every path exists without constructing a real hash
 * history (createWebHashHistory needs `window.location`, which is not
 * present in the plain Node test environment this project uses).
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore, type SessionMode } from '@/stores/session'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/log' },
  { path: '/welcome', component: () => import('@/screens/WelcomeScreen.vue') },
  { path: '/log', component: () => import('@/screens/LogScreen.vue') },
  { path: '/log/:category', component: () => import('@/screens/CategoryScreen.vue') },
  { path: '/today', component: () => import('@/screens/TodayScreen.vue') },
  { path: '/overview', component: () => import('@/screens/OverviewScreen.vue') },
  { path: '/rewards', component: () => import('@/screens/RewardsScreen.vue') },
  { path: '/kid', component: () => import('@/screens/KidScreen.vue') },
  { path: '/settings', component: () => import('@/screens/SettingsScreen.vue') },
]

export interface EntryContext {
  mode: SessionMode
  /** Whether `sessionStore.resume()` has settled. `false` means the router
   * guard is still waiting on it, in which case the navigation is left
   * alone; the guard itself only calls this once `ready` has resolved. */
  ready: boolean
  to: string
}

/**
 * Where a navigation to `to` should really land, given the session's state
 * (issue #16, Architecture.md §7): once `resume()` has settled, a
 * disconnected phone is sent to Welcome from anywhere else, and a connected
 * (sheets or demo) phone skips Welcome for Log. `null` means let the
 * navigation through as requested. Pure so the guard's logic is testable
 * without a router or a real session store (tests/router.test.ts).
 */
export function resolveEntry({ mode, ready, to }: EntryContext): string | null {
  if (!ready) return null
  if (mode === 'disconnected') return to === '/welcome' ? null : '/welcome'
  return to === '/welcome' ? '/log' : null
}

export function createAppRouter() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes,
  })

  // First navigation waits for the stored session to finish resuming (or
  // fail to), so a phone that is already connected never flashes Welcome
  // (issue #16, Architecture.md §7); `main.ts` kicks resume() off after mount.
  router.beforeEach(async (to) => {
    const session = useSessionStore()
    await session.ready
    return resolveEntry({ mode: session.mode, ready: true, to: to.path }) ?? true
  })

  return router
}

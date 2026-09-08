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

export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes,
  })
}

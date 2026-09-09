/**
 * The service worker (issue #45, Architecture.md §9). `injectManifest`
 * instead of `generateSW` (`vite.config.ts`): this is the only strategy
 * that lets a worker answer a runtime `postMessage` with its own stamped
 * `__BUILD_ID__`, which is how the Sync panel's "Service worker" row tells
 * a stale worker from the one a fresh deploy just shipped.
 *
 * `registerType: 'prompt'` (Architecture.md §9): this worker never calls
 * `self.skipWaiting()` on its own -- it waits for the `SKIP_WAITING`
 * message `usePwa.ts`'s `reload()` sends once the user taps Reload on
 * UpdateToast. Auto-swapping mid-tap is how an in-flight event gets lost.
 *
 * `self` is typed as `Window` in this project's shared tsconfig (`lib:
 * ["DOM", ...]`, Architecture.md §2): adding the `webworker` lib instead
 * (or alongside) would conflict with every other file's `self`/`postMessage`
 * globals across the one program `vue-tsc` type-checks. The local
 * `declare const self` below only shadows that type inside this module --
 * `declare` emits no code, so `self` is still the real worker global scope
 * at runtime. `precacheAndRoute(self.__WB_MANIFEST)` keeps that exact
 * literal spelling on purpose: workbox-build's injectManifest step finds it
 * by text search in the built file (its default `injectionPoint`), so a
 * cast or a renamed local would leave nothing for it to find.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'

declare const self: Window & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0]
  skipWaiting: () => void
}

// The app shell (HTML, JS, CSS, fonts, icons): the same
// `globPatterns` `vite.config.ts` used to pass to `generateSW`'s `workbox`
// option now live on `injectManifest` instead.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Hash routing means every route is served from the same index.html
// (Architecture.md §9); every navigation falls back to the precached shell,
// matching `generateSW`'s `navigateFallback: 'index.html'`.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// The Apps Script endpoint owns its own cache (the outbox and the snapshot
// in IndexedDB) -- the service worker must never serve a stale or cached
// response for it.
registerRoute(/^https:\/\/script\.google\.com\//, new NetworkOnly())

// Fonts (self-hosted @fontsource woff2) and the app icons.
registerRoute(/\.(?:woff2?|ttf)$/, new CacheFirst({ cacheName: 'fonts' }))
registerRoute(/\/icons\/.*\.png$/, new CacheFirst({ cacheName: 'icons' }))

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined
  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (data?.type === 'version') {
    event.ports[0]?.postMessage({ version: __BUILD_ID__ })
  }
})

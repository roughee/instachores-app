/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/vue" />

/** Issue #45: the build id `vite.config.ts` stamps in via `define`, read by
 * `SettingsScreen.vue` (the Sync panel's "App build" row) and by
 * `src/sw.ts` (answers to the `postMessage({ type: 'version' })` handshake
 * `usePwa.ts`'s `readServiceWorkerVersion` sends). */
declare const __BUILD_ID__: string

/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { resolveBase } from './vite.base'
import { resolveBuildId } from './vite.buildId'

// Plan §6.10 / issue #11: dark shell background and theme color so the
// splash screen and status bar never flash light before the app paints.
const SHELL_COLOR = '#131512'

// Issue #45: stamped into both the app bundle and `src/sw.ts` via `define`
// below (Architecture.md §9) so the Sync panel's "App build" and "Service
// worker" rows change on every deploy.
const BUILD_ID = resolveBuildId(process.env)

export default defineConfig({
  // Plan §6.13 / issue #12: PR previews override VITE_BASE so the built
  // asset URLs resolve under `pr-<n>/` instead of the repo root.
  base: resolveBase(process.env),
  // vite-plugin-pwa forwards `define` into the injectManifest service
  // worker build too (its one shared option between the app and worker
  // builds), which is how `src/sw.ts` sees the same `__BUILD_ID__`.
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    vue(),
    VitePWA({
      // The new worker waits until the user taps Reload on UpdateToast
      // (Architecture.md §9): auto-swapping mid-tap is how an event is lost.
      registerType: 'prompt',
      injectRegister: null,
      // `injectManifest` (issue #45) instead of `generateSW`: a small,
      // hand-written `src/sw.ts` is the only way to answer a `postMessage`
      // with the worker's own stamped build id at runtime -- `generateSW`
      // has no hook for that. It keeps the shell precache and the prompt
      // update flow identical; see `src/sw.ts` for the runtime caching this
      // config used to list under `workbox.runtimeCaching`.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Same globs `workbox.globPatterns` used under `generateSW`
        // (fonts, icons and the app shell alongside the JS/CSS/HTML).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'HomeCrew',
        short_name: 'HomeCrew',
        description: 'Make the daily grind count.',
        display: 'standalone',
        background_color: SHELL_COLOR,
        theme_color: SHELL_COLOR,
        // Hash routing (Architecture.md §9): GitHub Pages has no rewrites,
        // so the shell opens straight at the Log screen via the fragment.
        start_url: './#/log',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Kitchen Reset', url: './#/log/kitchen' },
          { name: 'Log trash', url: './#/log/kitchen' },
          { name: 'Laundry', url: './#/log/laundry' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/schemas/**', 'src/data/**', 'src/stores/**', 'src/composables/**'],
      reporter: ['text', 'html'],
      // Plan §7.5: 100% line coverage on the pure layers, 80% elsewhere.
      thresholds: {
        lines: 80,
        'src/domain/**': { lines: 100, functions: 100 },
        'src/schemas/**': { lines: 100, functions: 100 },
      },
    },
  },
})

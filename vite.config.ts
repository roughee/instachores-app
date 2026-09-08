/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { resolveBase } from './vite.base'

// Plan §6.10 / issue #11: dark shell background and theme color so the
// splash screen and status bar never flash light before the app paints.
const SHELL_COLOR = '#131512'

export default defineConfig({
  // Plan §6.13 / issue #12: PR previews override VITE_BASE so the built
  // asset URLs resolve under `pr-<n>/` instead of the repo root.
  base: resolveBase(process.env),
  plugins: [
    vue(),
    VitePWA({
      // The new worker waits until the user taps Reload on UpdateToast
      // (Architecture.md §9): auto-swapping mid-tap is how an event is lost.
      registerType: 'prompt',
      injectRegister: null,
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
      workbox: {
        // Hash routing means every route is served from the same
        // index.html; Workbox's default navigateFallback already covers
        // this, listed explicitly so the intent survives a config refactor.
        navigateFallback: 'index.html',
        // Fonts (self-hosted @fontsource woff2) and the app icons precache
        // alongside the shell, per Architecture.md §9.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // The Apps Script endpoint owns its own cache (the outbox and
            // the snapshot in IndexedDB) -- the service worker must never
            // serve a stale or cached response for it.
            urlPattern: /^https:\/\/script\.google\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\.(?:woff2?|ttf)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts' },
          },
          {
            urlPattern: /\/icons\/.*\.png$/,
            handler: 'CacheFirst',
            options: { cacheName: 'icons' },
          },
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

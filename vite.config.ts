/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/instachores-app/',
  plugins: [vue()],
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

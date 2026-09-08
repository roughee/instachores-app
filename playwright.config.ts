/**
 * Playwright e2e smoke config (issue #22, docs/Testing.md). Runs against the
 * production build via `vite preview` -- `npm run e2e` is `vite build &&
 * playwright test` -- never the dev server, so the service worker and hash
 * routing specs exercise what actually ships.
 *
 * Port 4180, not 4173: `scripts/screenshots.mjs` runs its own `vite preview`
 * on 4173 for PR screenshots, and the two must never collide.
 *
 * Browser: in CI there is no preinstalled Chromium, so the `e2e` job runs
 * `npx playwright install --with-deps chromium` first and this config uses
 * whatever that installs. Locally (and in this sandbox) Chromium is already
 * at `/opt/pw-browsers/chromium` (`PLAYWRIGHT_BROWSERS_PATH` is set) --
 * `executablePath` points straight at it and `playwright install` must never
 * run here, same rule as `scripts/screenshots.mjs`.
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = 4180
const isCI = Boolean(process.env.CI)
const executablePath = !isCI && process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  outputDir: 'e2e-results',
  reporter: isCI ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/instachores-app/`,
    testIdAttribute: 'data-test',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath !== undefined && { launchOptions: { executablePath } }),
      },
    },
  ],
  webServer: {
    // `dist/` must already be built (the `e2e` script builds first); this
    // config only starts the static preview server on top of it.
    command: `npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})

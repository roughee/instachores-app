// Screenshots the app shell in light and dark for the PR (Plan §7, DESIGN.md
// §8 pre-flight). Expects `vite preview` already serving dist/ at the URL
// below. Chromium is preinstalled; do not run `playwright install`.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'http://localhost:4173/instachores-app/'
const OUT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))

await mkdir(OUT_DIR, { recursive: true })

const executablePath = process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined

/**
 * Issue #16's router guard sends a disconnected phone to Welcome from
 * anywhere else, so a fresh page can no longer `goto` straight to `#/log` or
 * `#/settings`. This drives "Try the demo" first (no network, matches how a
 * real first run gets past Welcome), then hash-navigates on -- the query
 * string carries through unchanged so `usePwa.ts`'s force flags, read once
 * at startup, still apply.
 */
async function gotoConnected(page, query, hash) {
  await page.goto(`${BASE_URL}${query}#/welcome`, { waitUntil: 'networkidle' })
  await page.locator('[data-test="demo-button"]').click()
  await page.waitForFunction(() => location.hash === '#/log')
  if (hash !== '/log') {
    await page.goto(`${BASE_URL}${query}#${hash}`, { waitUntil: 'networkidle' })
  }
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await gotoConnected(page, '', '/log')
  await page.screenshot({ path: `${OUT_DIR}3-shell-${scheme}.png` })
  await browser.close()
  console.log(`saved 3-shell-${scheme}.png`)
}

// Issue #11: the update toast and install card only appear once the
// service worker signals a waiting update, or `beforeinstallprompt` fires
// -- neither happens on demand in a scripted run, so `usePwa.ts` reads two
// query flags (`forceUpdateToast`, `forceInstallCard`) that force each
// state on for a deterministic screenshot.
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await gotoConnected(page, '?forceUpdateToast=1', '/log')
  await page.getByRole('status').filter({ hasText: 'Update available' }).waitFor()
  await page.screenshot({ path: `${OUT_DIR}11-update-toast-${scheme}.png` })
  await browser.close()
  console.log(`saved 11-update-toast-${scheme}.png`)
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await gotoConnected(page, '?forceInstallCard=1', '/settings')
  await page.getByText('Add HomeCrew to your home screen').waitFor()
  await page.screenshot({ path: `${OUT_DIR}11-install-card-${scheme}.png` })
  await browser.close()
  console.log(`saved 11-install-card-${scheme}.png`)
}

// Issue #16: the Welcome / Connect screen, fresh (no stored session, so the
// router guard lets it through on its own).
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await page.goto(`${BASE_URL}#/welcome`, { waitUntil: 'networkidle' })
  await page.getByText('Connect your household').waitFor()
  await page.screenshot({ path: `${OUT_DIR}16-welcome-${scheme}.png` })
  await browser.close()
  console.log(`saved 16-welcome-${scheme}.png`)
}

// The inline error state, forced on with no interaction the same way as the
// PWA states above (`forceLinkError`, WelcomeScreen.vue).
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await page.goto(`${BASE_URL}?forceLinkError=1#/welcome`, { waitUntil: 'networkidle' })
  await page.getByText('That link is not a HomeCrew setup link.').waitFor()
  await page.screenshot({ path: `${OUT_DIR}16-welcome-error-${scheme}.png` })
  await browser.close()
  console.log(`saved 16-welcome-error-${scheme}.png`)
}

// Screenshots the app shell in light and dark for the PR (Plan §7, DESIGN.md
// §8 pre-flight). Expects `vite preview` already serving dist/ at the URL
// below. Chromium is preinstalled; do not run `playwright install`.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'http://localhost:4173/instachores-app/'
const PAGE_URL = `${BASE_URL}#/log`
const OUT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))

await mkdir(OUT_DIR, { recursive: true })

const executablePath = process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await page.goto(PAGE_URL, { waitUntil: 'networkidle' })
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
  await page.goto(`${BASE_URL}?forceUpdateToast=1#/log`, { waitUntil: 'networkidle' })
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
  await page.goto(`${BASE_URL}?forceInstallCard=1#/settings`, { waitUntil: 'networkidle' })
  await page.getByText('Add HomeCrew to your home screen').waitFor()
  await page.screenshot({ path: `${OUT_DIR}11-install-card-${scheme}.png` })
  await browser.close()
  console.log(`saved 11-install-card-${scheme}.png`)
}

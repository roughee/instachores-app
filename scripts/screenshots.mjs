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

// Issue #17: Log screen (household bar, quick row, category grid, toast).
// `?demo=1` starts a `MemoryRepo` demo household with no network (main.ts);
// `?demoLogs=N` then completes the first N quick-row tasks so the "after
// logging" shot has data. `MemoryRepo` never loses a real connection, so the
// offline shot also forces the sync store's status (`forceOffline`,
// `demoOutbox`) alongside a real `context.setOffline(true)` for the network.
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  await page.goto(`${BASE_URL}?demo=1#/log`, { waitUntil: 'networkidle' })
  await page.getByText('You today').waitFor()
  await page.screenshot({ path: `${OUT_DIR}17-log-empty-${scheme}.png` })
  await browser.close()
  console.log(`saved 17-log-empty-${scheme}.png`)
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  await page.goto(`${BASE_URL}?demo=1&demoLogs=3#/log`, { waitUntil: 'networkidle' })
  await page.getByText('You today').waitFor()
  await page.screenshot({ path: `${OUT_DIR}17-log-logged-${scheme}.png` })
  await browser.close()
  console.log(`saved 17-log-logged-${scheme}.png`)
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  const page = await context.newPage()
  await page.goto(`${BASE_URL}?demo=1&demoLogs=1&forceOffline=1&demoOutbox=3#/log`, { waitUntil: 'networkidle' })
  await page.getByText('waiting to sync').waitFor()
  await context.setOffline(true)
  await page.screenshot({ path: `${OUT_DIR}17-log-offline-${scheme}.png` })
  await context.setOffline(false)
  await browser.close()
  console.log(`saved 17-log-offline-${scheme}.png`)
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

// Issue #18: Today screen, grouped by hour. Reuses main.ts's `demo=1` /
// `demoLogs=N` flags (issue #17) as-is: `demoLogs=3` completes three
// quick-row tasks, which show up here too since Today reads the same
// events the household bar does.
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await page.goto(`${BASE_URL}?demo=1&demoLogs=3#/today`, { waitUntil: 'networkidle' })
  await page.locator('.today-row').first().waitFor()
  await page.screenshot({ path: `${OUT_DIR}18-today-${scheme}.png` })
  await browser.close()
  console.log(`saved 18-today-${scheme}.png`)
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  await page.goto(`${BASE_URL}?demo=1#/today`, { waitUntil: 'networkidle' })
  await page.getByText('Quiet so far').waitFor()
  await page.screenshot({ path: `${OUT_DIR}18-today-empty-${scheme}.png` })
  await browser.close()
  console.log(`saved 18-today-empty-${scheme}.png`)
}

// Issue #19: the week overview with a few demo logs, so the member split and
// the split bars have data (household bar shared with the Log screen).
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  await page.goto(`${BASE_URL}?demo=1&demoLogs=3#/overview`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Previous week' }).waitFor()
  await page.screenshot({ path: `${OUT_DIR}19-overview-${scheme}.png` })
  await browser.close()
  console.log(`saved 19-overview-${scheme}.png`)
}

// Issue #20: Category screen for a plain category (task buttons and the
// Hand-wash dishes group, its chips with no completions yet).
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  await page.goto(`${BASE_URL}?demo=1#/log/kitchen`, { waitUntil: 'networkidle' })
  await page.getByText('Hand-wash dishes').waitFor()
  await page.screenshot({ path: `${OUT_DIR}20-category-kitchen-${scheme}.png` })
  await browser.close()
  console.log(`saved 20-category-kitchen-${scheme}.png`)
}

// Issue #20: Category screen for the Clean bathroom combo group, with a x2
// badge on the Toilet chip. `?demoComplete=<id>,<id>` (CategoryScreen.vue,
// gated by `usePwa.ts`'s `hasFlag`/`flagValue`) completes the same sub-item
// twice on mount so the badge renders without scripting real taps.
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  await page.goto(`${BASE_URL}?demo=1&demoComplete=task-bathroom-toilet,task-bathroom-toilet#/log/bathroom`, {
    waitUntil: 'networkidle',
  })
  await page.getByText('x2').waitFor()
  await page.screenshot({ path: `${OUT_DIR}20-category-bathroom-x2-${scheme}.png` })
  await browser.close()
  console.log(`saved 20-category-bathroom-x2-${scheme}.png`)
}

// Issue #21: Settings (household + setup link, appearance, sync panel,
// disconnect, about). Demo mode shows the household section's demo hint
// (issue #46) rather than the internal `https://demo.invalid/exec` link,
// which cannot connect a partner's phone. A tall viewport (instead of
// `fullPage`) keeps the whole screen in one shot without the fixed bottom
// tab bar repeating mid-page.
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 390, height: 1500 }, colorScheme: scheme })
  await page.goto(`${BASE_URL}?demo=1#/settings`, { waitUntil: 'networkidle' })
  await page.getByText('Sync now').waitFor()
  await page.screenshot({ path: `${OUT_DIR}21-settings-${scheme}.png` })
  await browser.close()
  console.log(`saved 21-settings-${scheme}.png`)
}

// Issue #53: the celebration overlay, two of the ten moments, frozen at a
// fixed frame. `?forceCelebration=<id>` (App.vue) sets the exact moment
// instead of the random pick, at the instant the app boots. Two clocks
// would otherwise race a real page load: the JS removal timer (defused
// below, same as the other issues' `forceX` flags) and the CSS animation's
// own clock, which runs from mount regardless of any JS. So the freeze does
// not wait and hope: the Web Animations API pauses every icon's animation
// and sets its current time to 1350ms of the 2700ms moment, whatever the wall
// clock says. Every moment ends with a fade, so a late capture would
// otherwise be blank.
for (const id of /** @type {const} */ (['star-catch', 'sparkle-burst'])) {
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    const browser = await chromium.launch({ executablePath })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
    await page.addInitScript(() => {
      const realSetTimeout = window.setTimeout
      // @ts-expect-error -- screenshot-only override, not shipped code
      window.setTimeout = (fn, delay, ...args) => {
        if (delay === 2700) return 0
        return realSetTimeout(fn, delay, ...args)
      }
    })
    await page.goto(`${BASE_URL}?demo=1&forceCelebration=${id}#/log`, { waitUntil: 'networkidle' })
    await page.locator('[data-test="celebration"]').waitFor()
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.celebration__icon')) {
        for (const animation of el.getAnimations()) {
          animation.pause()
          animation.currentTime = 1350
        }
      }
    })
    await page.screenshot({ path: `${OUT_DIR}53-celebration-${id}-${scheme}.png` })
    await browser.close()
    console.log(`saved 53-celebration-${id}-${scheme}.png`)
  }
}

// Issue #69: the Next time sheet, opened after completing Clean bathroom
// (a combo group's own id, same as `?demoSchedule=1` in main.ts completes
// directly). `?demoSheet=task-bathroom-clean` (CategoryScreen.vue) runs
// that one completion through the normal `onComplete` path on mount, so the
// sheet opens with its 7-day interval preselected, for a deterministic shot.
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  await page.goto(`${BASE_URL}?demo=1&demoSheet=task-bathroom-clean#/log/bathroom`, { waitUntil: 'networkidle' })
  await page.getByRole('dialog').waitFor()
  await page.screenshot({ path: `${OUT_DIR}69-next-time-sheet-${scheme}.png` })
  await browser.close()
  console.log(`saved 69-next-time-sheet-${scheme}.png`)
}

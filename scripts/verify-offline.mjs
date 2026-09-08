// Verifies the installable-PWA acceptance criteria for issue #11: the
// service worker precaches the shell, so the built app still opens to the
// Log screen with the network off. Expects `vite preview` already serving
// dist/ at the URL below. Chromium is preinstalled; do not run
// `playwright install`.
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:4174/instachores-app/'
const LOG_URL = `${BASE_URL}#/log`
const LOG_PLACEHOLDER = 'Log a task in two taps once tasks are loaded.'

const executablePath = process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath })
const context = await browser.newContext()
const page = await context.newPage()

console.log(`loading ${LOG_URL} (online, first visit)`)
await page.goto(LOG_URL, { waitUntil: 'networkidle' })

console.log('waiting for the service worker to take control (navigator.serviceWorker.ready)')
await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) throw new Error('no serviceWorker support in this browser')
  const registration = await navigator.serviceWorker.ready
  if (!registration.active) throw new Error('service worker registered but not active')
})
const swState = await page.evaluate(
  () => navigator.serviceWorker.controller?.state ?? navigator.serviceWorker.controller ?? 'no controller yet',
)
console.log(`service worker state: ${swState}`)

// A fresh navigation is needed for the SW to control the page as its client
// (the very first load is served by the network before the SW takes over).
console.log('reloading once so the service worker controls this page')
await page.reload({ waitUntil: 'networkidle' })
const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
console.log(`page controlled by service worker: ${controlled}`)

console.log('going offline (context.setOffline(true))')
await context.setOffline(true)

console.log('reloading with the network off')
await page.reload({ waitUntil: 'domcontentloaded' })

// The precached HTML resolves immediately, but Vue still has to mount and
// route before the text node exists, so wait for it rather than racing a
// single innerText read against the app's own bootstrap.
let found = true
try {
  await page.getByText(LOG_PLACEHOLDER).waitFor({ timeout: 5000 })
} catch {
  found = false
}
console.log(`Log placeholder ("${LOG_PLACEHOLDER}") visible offline: ${found}`)

console.log('checking a script.google.com request is not served from any cache (NetworkOnly)')
let networkErrorSeen = false
page.on('requestfailed', (req) => {
  if (req.url().includes('script.google.com')) networkErrorSeen = true
})
try {
  await page.evaluate(() => fetch('https://script.google.com/macros/s/fake/exec'))
} catch {
  // A network-level throw from fetch() itself also proves NetworkOnly.
  networkErrorSeen = true
}
await page.waitForTimeout(200)
console.log(`script.google.com request failed offline instead of being served from cache: ${networkErrorSeen}`)

await context.setOffline(false)
await browser.close()

if (!found) {
  console.error('FAIL: Log placeholder not visible offline')
  process.exit(1)
}
if (!networkErrorSeen) {
  console.error('FAIL: script.google.com request was not observed failing offline (may be cached)')
  process.exit(1)
}
console.log('PASS: offline shell verification complete')

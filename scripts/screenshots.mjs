// Screenshots the app shell in light and dark for the PR (Plan §7, DESIGN.md
// §8 pre-flight). Expects `vite preview` already serving dist/ at the URL
// below. Chromium is preinstalled; do not run `playwright install`.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PAGE_URL = 'http://localhost:4173/instachores-app/#/log'
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

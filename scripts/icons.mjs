// Generates the PWA app icons (Plan §6.10, issue #11 design notes) from a
// single SVG mark: a rounded square in the primary teal with a white
// cooking-pot glyph (Phosphor's `CookingPot` regular weight path, traced by
// hand from node_modules/@phosphor-icons/vue so this script has no runtime
// dependency on that package's internals). Chromium is preinstalled; do not
// run `playwright install`.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const OUT_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url))

// The note on issue #11 darkens the light `--primary` token to this value on
// another branch; the icon uses it directly rather than waiting on the merge.
const BRAND = '#128369'

// Phosphor "CookingPot", weight regular, 256x256 viewBox.
const GLYPH_PATH =
  'M88,48V16a8,8,0,0,1,16,0V48a8,8,0,0,1-16,0Zm40,8a8,8,0,0,0,8-8V16a8,8,0,0,0-16,0V48A8,8,0,0,0,128,56Zm32,0a8,8,0,0,0,8-8V16a8,8,0,0,0-16,0V48A8,8,0,0,0,160,56Zm92.8,46.4L224,124v60a32,32,0,0,1-32,32H64a32,32,0,0,1-32-32V124L3.2,102.4a8,8,0,0,1,9.6-12.8L32,104V80a8,8,0,0,1,8-8H216a8,8,0,0,1,8,8v24l19.2-14.4a8,8,0,0,1,9.6,12.8ZM208,88H48v96a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16Z'

/**
 * @param {number} size
 * @param {{ maskable?: boolean }} [opts]
 */
function iconSvg(size, { maskable = false } = {}) {
  // Maskable icons are full-bleed (the OS applies its own mask shape) and
  // keep the glyph inside the ~80% "safe zone" circle; the regular icon
  // keeps its own rounded-square silhouette with a larger glyph.
  const radius = maskable ? 0 : Math.round(size * 0.22)
  const glyphSize = maskable ? size * 0.42 : size * 0.56
  const offset = (size - glyphSize) / 2
  const scale = glyphSize / 256
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}" />
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="${GLYPH_PATH}" fill="#ffffff" />
  </g>
</svg>`
}

async function renderPng(browser, svg, size, outPath) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<!doctype html><html><head><style>*{margin:0;padding:0}</style></head><body>${svg}</body></html>`,
  )
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: size, height: size } })
  await page.close()
}

await mkdir(OUT_DIR, { recursive: true })

const sourceSvg = iconSvg(512, { maskable: false })
await writeFile(`${OUT_DIR}icon.svg`, sourceSvg)
console.log('saved icon.svg')

const executablePath = process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath })

await renderPng(browser, iconSvg(192, { maskable: false }), 192, `${OUT_DIR}icon-192.png`)
console.log('saved icon-192.png')

await renderPng(browser, sourceSvg, 512, `${OUT_DIR}icon-512.png`)
console.log('saved icon-512.png')

await renderPng(browser, iconSvg(512, { maskable: true }), 512, `${OUT_DIR}icon-512-maskable.png`)
console.log('saved icon-512-maskable.png')

await browser.close()

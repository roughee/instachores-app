/**
 * "No hard-coded colors in components" (CLAUDE.md, DESIGN.md §3), checked at
 * runtime rather than by grepping source (issue #22): every element's
 * computed `color`/`background-color` must resolve to one of the tokens
 * `tokens.css` defines on `:root` for the active theme, or be transparent.
 *
 * Approach: build a probe element, set its `color`/`background-color` to
 * `var(--token)` for every token in `TOKENS`, and read back the *resolved*
 * value (`getComputedStyle` turns `color-mix(...)` into a plain `rgb()`
 * string the same way it would for a real element) -- that resolved set is
 * "derived from a custom property". Then walk every element under `#app`
 * and flag any non-transparent `color`/`background-color` that is not in
 * that set.
 *
 * One documented, pragmatic exception: a color Vue set as an *inline* style
 * rather than through a CSS class. On this app that is always one of two
 * things, neither a hard-coded design decision: a household member's own
 * `color` field (avatars, the household bar split, the welcome member dot;
 * there is no token for a specific member), or a token blended with
 * transparency for a second series sharing a category (`SplitBars.vue`'s
 * `color-mix(in oklab, var(--cat-x) 55%, transparent)`, still derived from a
 * token, just not at full strength). `background` (the shorthand Vue's
 * `:style` binds) is checked alongside `backgroundColor`, since setting the
 * shorthand with a `color-mix()` value does not always populate the
 * longhand back on `element.style`.
 */
import type { Page } from '@playwright/test'

const TOKENS = [
  '--bg',
  '--surface',
  '--surface-2',
  '--border',
  '--text',
  '--text-2',
  '--primary',
  '--on-primary',
  '--primary-soft',
  '--points',
  '--success',
  '--warn',
  '--danger',
  '--cat-kitchen',
  '--cat-laundry',
  '--cat-floors',
  '--cat-bathroom',
  '--cat-kids',
  '--cat-home',
  '--cat-admin',
  '--cat-car',
  '--cat-kitchen-soft',
  '--cat-laundry-soft',
  '--cat-floors-soft',
  '--cat-bathroom-soft',
  '--cat-kids-soft',
  '--cat-home-soft',
  '--cat-admin-soft',
  '--cat-car-soft',
] as const

export interface ColorOffender {
  selector: string
  property: 'color' | 'backgroundColor'
  value: string
}

export async function auditTokenColors(page: Page): Promise<ColorOffender[]> {
  return page.evaluate((tokens: readonly string[]) => {
    const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent'])
    const properties = ['color', 'backgroundColor'] as const

    const probe = document.createElement('div')
    probe.style.position = 'fixed'
    probe.style.opacity = '0'
    probe.style.pointerEvents = 'none'
    document.body.appendChild(probe)
    const tokenValues = new Set<string>()
    for (const t of tokens) {
      probe.style.color = `var(${t})`
      tokenValues.add(getComputedStyle(probe).color)
      probe.style.backgroundColor = `var(${t})`
      tokenValues.add(getComputedStyle(probe).backgroundColor)
    }
    document.body.removeChild(probe)

    const offenders: ColorOffender[] = []
    const root = document.getElementById('app')
    if (!root) return offenders

    for (const el of Array.from(root.querySelectorAll('*'))) {
      const cs = getComputedStyle(el)
      const inlineStyle = (el as HTMLElement).style
      for (const prop of properties) {
        const value = cs[prop]
        if (!value || TRANSPARENT.has(value)) continue
        if (tokenValues.has(value)) continue
        const inline =
          prop === 'backgroundColor' ? inlineStyle.backgroundColor || inlineStyle.background : inlineStyle.color
        if (inline) continue // inline-style exception, see module doc
        const cls =
          typeof el.className === 'string' && el.className.length > 0 ? `.${el.className.split(' ').join('.')}` : ''
        offenders.push({ selector: `${el.tagName.toLowerCase()}${cls}`, property: prop, value })
      }
    }
    return offenders
  }, TOKENS)
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractTokens, type TokenBlock } from './extractTokens'
import { contrastRatio, mixOklab } from './wcag'

// The real file, not a copy: this test cannot drift from the source tokens.
const TOKENS_CSS_PATH = resolve(__dirname, '../../src/styles/tokens.css')
const tokensCss = readFileSync(TOKENS_CSS_PATH, 'utf-8')
const { light, dark, darkSystem } = extractTokens(tokensCss)

// DESIGN.md §3.
const TEXT_ON_SURFACE_MIN = 4.5
const ON_PRIMARY_MIN = 4.5
const CATEGORY_SOFT_MIN = 3
// The `-soft` tints are `color-mix(in oklab, var(--cat-x) 14%, var(--surface))`.
const SOFT_TINT_CATEGORY_PERCENT = 14

const SURFACE_TOKENS = ['bg', 'surface', 'surface-2'] as const
const TEXT_TOKENS = ['text', 'text-2'] as const
const CATEGORY_TOKENS = [
  'cat-kitchen',
  'cat-laundry',
  'cat-floors',
  'cat-bathroom',
  'cat-kids',
  'cat-home',
  'cat-admin',
] as const

function requireToken(tokens: TokenBlock, name: string, theme: string): string {
  const value = tokens[name]
  if (value === undefined) {
    throw new Error(`tokens.css (${theme} theme): missing --${name}`)
  }
  return value
}

const themes = [
  ['light', light],
  ['dark', dark],
] satisfies Array<[string, TokenBlock]>

describe.each(themes)('color token contrast, %s theme (DESIGN.md §3)', (theme, tokens) => {
  const textOnSurfacePairs = TEXT_TOKENS.flatMap((textToken) =>
    SURFACE_TOKENS.map((surfaceToken) => ({ textToken, surfaceToken })),
  )

  it.each(textOnSurfacePairs)('--$textToken on --$surfaceToken is at least 4.5:1', ({ textToken, surfaceToken }) => {
    const textHex = requireToken(tokens, textToken, theme)
    const surfaceHex = requireToken(tokens, surfaceToken, theme)
    const ratio = contrastRatio(textHex, surfaceHex)
    expect(
      ratio,
      `--${textToken} (${textHex}) on --${surfaceToken} (${surfaceHex}) is only ${ratio.toFixed(2)}:1, needs >= ${TEXT_ON_SURFACE_MIN}:1`,
    ).toBeGreaterThanOrEqual(TEXT_ON_SURFACE_MIN)
  })

  it('--on-primary on --primary is at least 4.5:1', () => {
    const onPrimaryHex = requireToken(tokens, 'on-primary', theme)
    const primaryHex = requireToken(tokens, 'primary', theme)
    const ratio = contrastRatio(onPrimaryHex, primaryHex)
    expect(
      ratio,
      `--on-primary (${onPrimaryHex}) on --primary (${primaryHex}) is only ${ratio.toFixed(2)}:1, needs >= ${ON_PRIMARY_MIN}:1`,
    ).toBeGreaterThanOrEqual(ON_PRIMARY_MIN)
  })

  it.each(CATEGORY_TOKENS.map((categoryToken) => ({ categoryToken })))(
    '--$categoryToken is at least 3:1 against its own soft tint',
    ({ categoryToken }) => {
      const categoryHex = requireToken(tokens, categoryToken, theme)
      const surfaceHex = requireToken(tokens, 'surface', theme)
      const softHex = mixOklab(categoryHex, SOFT_TINT_CATEGORY_PERCENT, surfaceHex)
      const ratio = contrastRatio(categoryHex, softHex)
      expect(
        ratio,
        `--${categoryToken} (${categoryHex}) on its soft tint (${softHex}, derived from --surface ${surfaceHex}) is only ${ratio.toFixed(2)}:1, needs >= ${CATEGORY_SOFT_MIN}:1`,
      ).toBeGreaterThanOrEqual(CATEGORY_SOFT_MIN)
    },
  )
})

const describeIfDarkSystemBlock = darkSystem === undefined ? describe.skip : describe

describeIfDarkSystemBlock('prefers-color-scheme dark block', () => {
  it('matches [data-theme="dark"] exactly, so this test only ever reads one of them', () => {
    expect(darkSystem).toEqual(dark)
  })
})

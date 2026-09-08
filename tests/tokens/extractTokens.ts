/**
 * A small regex-based extractor for src/styles/tokens.css. It is not a CSS
 * parser: it only looks for the literal `:root { ... }` and
 * `[data-theme="dark"] { ... }` blocks, then pulls hex-valued custom
 * properties out of each. Non-hex tokens (radii, durations, the
 * `color-mix(...)` `-soft` tints) are skipped -- tests/tokens/contrast.test.ts
 * derives those itself with the real `--surface` and category values, per
 * DESIGN.md §3.
 *
 * Pure function of the file's text, so it never touches disk itself and is
 * cheap to unit test against a fixture string.
 */

export type TokenBlock = Record<string, string>

export interface ExtractedTokens {
  light: TokenBlock
  dark: TokenBlock
  /**
   * The `:root:not([data-theme="light"])` block inside a
   * `@media (prefers-color-scheme: dark)` rule, when tokens.css has one.
   * Present so a test can assert it stays identical to `dark` without this
   * extractor silently reading stale duplicated values.
   */
  darkSystem?: TokenBlock
}

function extractBlockBody(css: string, selector: RegExp): string | undefined {
  return selector.exec(css)?.[1]
}

function extractHexVars(blockBody: string): TokenBlock {
  const result: TokenBlock = {}
  const varPattern = /--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g
  for (const match of blockBody.matchAll(varPattern)) {
    const name = match[1]
    const value = match[2]
    if (name !== undefined && value !== undefined) {
      result[name] = value
    }
  }
  return result
}

// Anchored so ":root {" does not also match ":root:not([data-theme='light'])
// {" -- the latter requires a `:` immediately after "root", the former
// requires whitespace-then-brace.
const LIGHT_ROOT = /:root\s*\{([^}]*)\}/
const DARK_THEME = /\[data-theme=['"]dark['"]\]\s*\{([^}]*)\}/
const DARK_SYSTEM = /:root:not\(\[data-theme=['"]light['"]\]\)\s*\{([^}]*)\}/

export function extractTokens(css: string): ExtractedTokens {
  const lightBody = extractBlockBody(css, LIGHT_ROOT)
  const darkBody = extractBlockBody(css, DARK_THEME)
  const darkSystemBody = extractBlockBody(css, DARK_SYSTEM)

  if (lightBody === undefined) {
    throw new Error('extractTokens: no top-level :root block found')
  }
  if (darkBody === undefined) {
    throw new Error('extractTokens: no [data-theme="dark"] block found')
  }

  const light = extractHexVars(lightBody)
  const dark = extractHexVars(darkBody)

  return darkSystemBody === undefined ? { light, dark } : { light, dark, darkSystem: extractHexVars(darkSystemBody) }
}

/**
 * Pure WCAG contrast math plus a small OKLab `color-mix` approximation, used
 * by tests/tokens/contrast.test.ts to check the real color tokens. No Vue,
 * no fetch, no CSS parser: this module only ever sees hex strings.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

interface Oklab {
  L: number
  a: number
  b: number
}

/** Parses a 3- or 6-digit hex color, with or without a leading `#`. */
export function hexToRgb(hex: string): Rgb {
  const cleaned = hex.trim().replace(/^#/, '')
  const full = cleaned.length === 3 ? cleaned.replace(/./g, (c) => c + c) : cleaned
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`wcag: not a hex color: "${hex}"`)
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// WCAG 2.x §1.4.3 uses 0.03928 as the linearization threshold (not the
// 0.04045 the sRGB spec itself uses) -- keep the two thresholds separate so
// this function matches the WCAG formula exactly.
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function wcagLinearize(channel8bit: number): number {
  const c = channel8bit / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a hex color, in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * wcagLinearize(r) + 0.7152 * wcagLinearize(g) + 0.0722 * wcagLinearize(b)
}

/** WCAG contrast ratio between two hex colors, in [1, 21]. Order-independent. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// --- OKLab, for approximating `color-mix(in oklab, ...)` -------------------
//
// Björn Ottosson's OKLab conversion (the same one CSS Color 4 references),
// via linear sRGB. The sRGB EOTF here uses the 0.04045 threshold from the
// sRGB spec itself, distinct from the WCAG luminance threshold above -- both
// are "the same curve" to a rounding convention, so this module keeps two
// small linearizers rather than reusing one for both purposes.
// https://bottosson.github.io/posts/oklab/
// https://www.w3.org/TR/css-color-4/#color-mix (mixing happens per-component
// in the chosen color space, weighted by the (normalized) percentages)

function srgbToLinear(channel8bit: number): number {
  const c = channel8bit / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return v * 255
}

function linearSrgbToOklab(r: number, g: number, b: number): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

function oklabToLinearSrgb({ L, a, b }: Oklab): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

function hexToOklab(hex: string): Oklab {
  const { r, g, b } = hexToRgb(hex)
  return linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b))
}

function oklabToHex(lab: Oklab): string {
  const linear = oklabToLinearSrgb(lab)
  return rgbToHex({
    r: linearToSrgb(linear.r),
    g: linearToSrgb(linear.g),
    b: linearToSrgb(linear.b),
  })
}

/**
 * Approximates `color-mix(in oklab, colorA <percentA>%, colorB <percentB>%)`
 * (CSS Color 4 §9): convert both colors to OKLab and take their weighted
 * average, component by component, then convert back to sRGB. Both inputs
 * here are always fully opaque, so this skips the premultiply/un-premultiply
 * alpha handling the full spec algorithm does for translucent colors.
 *
 * `percentB` defaults to `100 - percentA`, matching `color-mix(in oklab,
 * var(--cat-x) 14%, var(--surface))` in tokens.css, which omits the second
 * percentage.
 */
export function mixOklab(colorA: string, percentA: number, colorB: string, percentB = 100 - percentA): string {
  const total = percentA + percentB
  const weightA = percentA / total
  const weightB = percentB / total
  const labA = hexToOklab(colorA)
  const labB = hexToOklab(colorB)
  return oklabToHex({
    L: weightA * labA.L + weightB * labB.L,
    a: weightA * labA.a + weightB * labB.a,
    b: weightA * labA.b + weightB * labB.b,
  })
}

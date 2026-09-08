import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, mixOklab, relativeLuminance, rgbToHex } from './wcag'

describe('hexToRgb / rgbToHex', () => {
  it('parses 6-digit and 3-digit hex, with or without a leading #', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#1e1d1a')).toEqual({ r: 30, g: 29, b: 26 })
  })

  it('rejects a value that is not a hex color', () => {
    expect(() => hexToRgb('not-a-color')).toThrow()
    expect(() => hexToRgb('#12')).toThrow()
  })

  it('round-trips through rgbToHex', () => {
    expect(rgbToHex(hexToRgb('#1e1d1a'))).toBe('#1e1d1a')
    expect(rgbToHex(hexToRgb('#fdfcf9'))).toBe('#fdfcf9')
  })
})

describe('relativeLuminance (WCAG 2.x §1.4.3)', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('is higher for a lighter color', () => {
    expect(relativeLuminance('#fdfcf9')).toBeGreaterThan(relativeLuminance('#1c1f1c'))
  })
})

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('white on white is 1:1', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('black on black is 1:1', () => {
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5)
  })

  it('does not depend on argument order', () => {
    expect(contrastRatio('#1e1d1a', '#fdfcf9')).toBeCloseTo(contrastRatio('#fdfcf9', '#1e1d1a'), 10)
  })
})

describe('mixOklab (CSS Color 4 color-mix, "in oklab")', () => {
  it('mixing a color with itself returns that color', () => {
    expect(mixOklab('#d9603f', 14, '#d9603f')).toBe('#d9603f')
  })

  it('100% of color A returns color A', () => {
    expect(mixOklab('#d9603f', 100, '#fdfcf9')).toBe('#d9603f')
  })

  it('0% of color A returns color B', () => {
    expect(mixOklab('#d9603f', 0, '#fdfcf9')).toBe('#fdfcf9')
  })

  it('a 14% tint sits between the category color and the surface in contrast terms', () => {
    const soft = mixOklab('#d9603f', 14, '#fdfcf9')
    expect(contrastRatio(soft, '#fdfcf9')).toBeLessThan(contrastRatio('#d9603f', '#fdfcf9'))
    expect(contrastRatio('#d9603f', soft)).toBeLessThan(contrastRatio('#d9603f', '#fdfcf9'))
  })
})

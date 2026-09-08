import { describe, expect, it } from 'vitest'
import { resolveBase } from '../../vite.base'

/**
 * The Vite `base` must agree with the hash router and with where a PR
 * preview is published (Plan §6.13, issue #12): the default serves the app
 * from the repo's Pages root, while a PR preview overrides it with
 * VITE_BASE so the built asset URLs resolve under `pr-<n>/`.
 */
describe('resolveBase', () => {
  it('defaults to the repository root path when VITE_BASE is unset', () => {
    expect(resolveBase({})).toBe('/instachores-app/')
  })

  it('passes through a VITE_BASE value that already ends with a slash', () => {
    expect(resolveBase({ VITE_BASE: '/instachores-app/pr-12/' })).toBe('/instachores-app/pr-12/')
  })

  it('appends a trailing slash to a VITE_BASE value that is missing one', () => {
    expect(resolveBase({ VITE_BASE: '/instachores-app/pr-12' })).toBe('/instachores-app/pr-12/')
  })
})

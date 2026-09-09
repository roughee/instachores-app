import { describe, expect, it } from 'vitest'
import { resolveBuildId } from '../../vite.buildId'

/**
 * Issue #45: the Sync panel's "App build" and "Service worker" rows need a
 * signal that actually changes on every deploy, not the hand-edited
 * `package.json` version (issue #21). CI sets `GITHUB_SHA`
 * (`deploy.yml`/`preview.yml`); a local build has none, so it falls back to
 * a UTC timestamp -- deterministic given an injected `now`, same pattern as
 * `time.ts` (Architecture.md §8).
 */
describe('resolveBuildId', () => {
  it('uses the first 7 characters of GITHUB_SHA when present', () => {
    expect(resolveBuildId({ GITHUB_SHA: 'abcdef1234567890' }, new Date('2026-09-09T12:00:00Z'))).toBe('abcdef1')
  })

  it('falls back to a UTC dev timestamp when GITHUB_SHA is unset', () => {
    expect(resolveBuildId({}, new Date('2026-09-09T12:00:00Z'))).toBe('dev-20260909T1200')
  })

  it('pads single-digit month, day, hour and minute in the dev timestamp', () => {
    expect(resolveBuildId({}, new Date('2026-01-02T03:04:00Z'))).toBe('dev-20260102T0304')
  })

  it('ignores an empty-string GITHUB_SHA and falls back to the dev timestamp', () => {
    expect(resolveBuildId({ GITHUB_SHA: '' }, new Date('2026-09-09T12:00:00Z'))).toBe('dev-20260909T1200')
  })

  it('defaults `now` to the current time when omitted', () => {
    const id = resolveBuildId({})
    expect(id).toMatch(/^dev-\d{8}T\d{4}$/)
  })
})

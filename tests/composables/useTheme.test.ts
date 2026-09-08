import { describe, expect, it } from 'vitest'
import { applyTheme, readPrefs, writePrefs } from '@/composables/useTheme'

/** A minimal stand-in for `localStorage`, backed by a plain object. */
function fakeStorage(data: Record<string, string> = {}) {
  return {
    getItem: (k: string): string | null => (k in data ? (data[k] ?? null) : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

/** A minimal stand-in for `document.documentElement`. */
function fakeRoot(theme?: string): { dataset: { theme?: string } } {
  return { dataset: theme === undefined ? {} : { theme } }
}

describe('applyTheme', () => {
  it('system removes the data-theme attribute', () => {
    const root = fakeRoot('dark')
    applyTheme('system', root)
    expect(root.dataset.theme).toBeUndefined()
  })

  it('dark sets data-theme to dark', () => {
    const root = fakeRoot()
    applyTheme('dark', root)
    expect(root.dataset.theme).toBe('dark')
  })

  it('light sets data-theme to light', () => {
    const root = fakeRoot()
    applyTheme('light', root)
    expect(root.dataset.theme).toBe('light')
  })
})

describe('readPrefs', () => {
  it('returns defaults (system) when nothing is stored', () => {
    const p = readPrefs(fakeStorage())
    expect(p.theme).toBe('system')
  })

  it('returns defaults (system) on corrupt stored JSON', () => {
    const p = readPrefs(fakeStorage({ 'homecrew.prefs': '{not json' }))
    expect(p.theme).toBe('system')
  })

  it('returns defaults (system) when the stored theme fails schema validation', () => {
    const p = readPrefs(fakeStorage({ 'homecrew.prefs': JSON.stringify({ v: 1, theme: 'blue' }) }))
    expect(p.theme).toBe('system')
  })

  it('reads a valid stored theme', () => {
    const p = readPrefs(fakeStorage({ 'homecrew.prefs': JSON.stringify({ v: 1, theme: 'dark' }) }))
    expect(p.theme).toBe('dark')
  })
})

describe('writePrefs', () => {
  it('round-trips through readPrefs', () => {
    const storage = fakeStorage()
    writePrefs(storage, { v: 1, theme: 'light' })
    expect(readPrefs(storage).theme).toBe('light')
  })
})

import { describe, expect, it } from 'vitest'
import { Prefs } from '@/schemas'

describe('Prefs schema', () => {
  it('applies defaults to an empty object', () => {
    const p = Prefs.parse({})
    expect(p.v).toBe(1)
    expect(p.theme).toBe('system')
    expect(p.lastTab).toBeUndefined()
  })

  it('accepts a full valid prefs object', () => {
    const p = Prefs.parse({ v: 1, theme: 'dark', lastTab: '#/today' })
    expect(p.theme).toBe('dark')
    expect(p.lastTab).toBe('#/today')
  })

  it('rejects an unknown theme', () => {
    expect(Prefs.safeParse({ theme: 'purple' }).success).toBe(false)
  })

  it('rejects a non-literal version', () => {
    expect(Prefs.safeParse({ v: 2 }).success).toBe(false)
  })

  it('rejects an empty lastTab string', () => {
    expect(Prefs.safeParse({ lastTab: '' }).success).toBe(false)
  })

  it('installCardDismissed is undefined by default', () => {
    const p = Prefs.parse({})
    expect(p.installCardDismissed).toBeUndefined()
  })

  it('accepts installCardDismissed true', () => {
    const p = Prefs.parse({ installCardDismissed: true })
    expect(p.installCardDismissed).toBe(true)
  })

  it('rejects a non-boolean installCardDismissed', () => {
    expect(Prefs.safeParse({ installCardDismissed: 'yes' }).success).toBe(false)
  })
})

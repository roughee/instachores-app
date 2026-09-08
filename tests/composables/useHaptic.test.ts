// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHaptic } from '@/composables/useHaptic'

describe('useHaptic', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
  })

  it('ticks navigator.vibrate with a short pattern when it is available', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })

    useHaptic().tick()

    expect(vibrate).toHaveBeenCalledWith([10])
  })

  it('does nothing when navigator.vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })

    expect(() => useHaptic().tick()).not.toThrow()
  })
})

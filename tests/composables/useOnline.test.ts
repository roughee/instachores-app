// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest'
import { useOnline } from '@/composables/useOnline'
import { withSetup } from '../helpers/withSetup'

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('useOnline', () => {
  beforeEach(() => {
    setNavigatorOnline(true)
  })

  it('reflects navigator.onLine at mount time', () => {
    setNavigatorOnline(false)
    const [state] = withSetup(() => useOnline())
    expect(state.online.value).toBe(false)
  })

  it('flips to false when the offline event fires', () => {
    const [state] = withSetup(() => useOnline())
    expect(state.online.value).toBe(true)

    setNavigatorOnline(false)
    window.dispatchEvent(new Event('offline'))

    expect(state.online.value).toBe(false)
  })

  it('flips to true when the online event fires', () => {
    setNavigatorOnline(false)
    const [state] = withSetup(() => useOnline())
    expect(state.online.value).toBe(false)

    setNavigatorOnline(true)
    window.dispatchEvent(new Event('online'))

    expect(state.online.value).toBe(true)
  })

  it('stops listening after the owning component unmounts', () => {
    const [state, app] = withSetup(() => useOnline())
    app.unmount()

    setNavigatorOnline(false)
    window.dispatchEvent(new Event('offline'))

    expect(state.online.value).toBe(true)
  })
})

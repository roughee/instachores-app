// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

// `virtual:pwa-register/vue` only exists once vite-plugin-pwa's Vite plugin
// runs; under Vitest it must be mocked so usePwa can be imported at all.
const registerSW = vi.hoisted(() => ({
  needRefresh: { value: false },
  offlineReady: { value: false },
  updateServiceWorker: vi.fn(),
}))
vi.mock('virtual:pwa-register/vue', () => ({
  useRegisterSW: vi.fn(() => registerSW),
}))

import {
  flagValue,
  hasFlag,
  installCardVisible,
  isStandaloneDisplay,
  readPollIntervalMs,
  readServiceWorkerVersion,
  usePwa,
} from '@/composables/usePwa'
import { withSetup } from '../helpers/withSetup'

describe('hasFlag / flagValue', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('hasFlag is false when the query flag is absent', () => {
    expect(hasFlag('demoComplete')).toBe(false)
  })

  it('hasFlag is true once the query flag is present, even with no value', () => {
    window.history.replaceState({}, '', '/?demoComplete')
    expect(hasFlag('demoComplete')).toBe(true)
  })

  it('flagValue returns null when the query flag is absent', () => {
    expect(flagValue('demoComplete')).toBeNull()
  })

  it('flagValue returns the raw query value', () => {
    window.history.replaceState({}, '', '/?demoComplete=task-a,task-b')
    expect(flagValue('demoComplete')).toBe('task-a,task-b')
  })
})

describe('installCardVisible (pure)', () => {
  it('is visible when not standalone, a prompt is captured, and not dismissed', () => {
    expect(installCardVisible({ standalone: false, canInstall: true, dismissed: false })).toBe(true)
  })

  it('is hidden when already installed (standalone)', () => {
    expect(installCardVisible({ standalone: true, canInstall: true, dismissed: false })).toBe(false)
  })

  it('is hidden when no install prompt was captured', () => {
    expect(installCardVisible({ standalone: false, canInstall: false, dismissed: false })).toBe(false)
  })

  it('is hidden once dismissed, even if a prompt is available', () => {
    expect(installCardVisible({ standalone: false, canInstall: true, dismissed: true })).toBe(false)
  })
})

describe('isStandaloneDisplay (pure)', () => {
  it('true when the display-mode media query matches', () => {
    expect(isStandaloneDisplay({}, { matches: true })).toBe(true)
  })

  it('true when navigator.standalone is set (iOS)', () => {
    expect(isStandaloneDisplay({ standalone: true }, { matches: false })).toBe(true)
  })

  it('false otherwise', () => {
    expect(isStandaloneDisplay({}, { matches: false })).toBe(false)
  })
})

describe('usePwa', () => {
  beforeEach(() => {
    localStorage.clear()
    registerSW.needRefresh.value = false
    window.history.replaceState({}, '', '/')
  })

  it('exposes needRefresh from the registered service worker and reload() forwards to it', async () => {
    registerSW.needRefresh.value = true
    const [pwa] = withSetup(() => usePwa())
    expect(pwa.needRefresh.value).toBe(true)
    await pwa.reload()
    expect(registerSW.updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('showInstallCard stays false until beforeinstallprompt fires', () => {
    const [pwa] = withSetup(() => usePwa())
    expect(pwa.showInstallCard.value).toBe(false)
  })

  it('captures beforeinstallprompt, exposes showInstallCard, and install() calls prompt()', async () => {
    const [pwa, app] = withSetup(() => usePwa())
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)

    expect(preventDefault).toHaveBeenCalled()
    expect(pwa.showInstallCard.value).toBe(true)

    await pwa.install()
    expect(prompt).toHaveBeenCalled()
    expect(pwa.canInstall.value).toBe(false)
    app.unmount()
  })

  it('dismissInstallCard persists to prefs and hides the card', () => {
    const [pwa] = withSetup(() => usePwa())
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    window.dispatchEvent(event)
    expect(pwa.showInstallCard.value).toBe(true)

    pwa.dismissInstallCard()
    expect(pwa.showInstallCard.value).toBe(false)
    expect(JSON.parse(localStorage.getItem('homecrew.prefs') ?? '{}').installCardDismissed).toBe(true)
  })

  it('a forceUpdateToast query flag forces needRefresh true, for deterministic screenshots', () => {
    window.history.replaceState({}, '', '/?forceUpdateToast=1')
    const [pwa] = withSetup(() => usePwa())
    expect(pwa.needRefresh.value).toBe(true)
  })

  it('a forceInstallCard query flag forces showInstallCard true, for deterministic screenshots', () => {
    window.history.replaceState({}, '', '/?forceInstallCard=1')
    const [pwa] = withSetup(() => usePwa())
    expect(pwa.showInstallCard.value).toBe(true)
  })
})

describe('readPollIntervalMs (issue #22)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('is undefined with no ?pollMs= flag, so SheetsRepo keeps its own default', () => {
    expect(readPollIntervalMs()).toBeUndefined()
  })

  it('reads a positive ?pollMs= as a number', () => {
    window.history.replaceState({}, '', '/?pollMs=500')
    expect(readPollIntervalMs()).toBe(500)
  })

  it('ignores a zero, negative or non-numeric value', () => {
    for (const bad of ['0', '-5', 'nope']) {
      window.history.replaceState({}, '', `/?pollMs=${bad}`)
      expect(readPollIntervalMs()).toBeUndefined()
    }
  })
})

describe('readServiceWorkerVersion (issue #45, pure)', () => {
  it('resolves undefined when nothing controls the page', async () => {
    await expect(readServiceWorkerVersion({ controller: null })).resolves.toBeUndefined()
  })

  it('resolves undefined when navigator.serviceWorker does not exist at all (e.g. Vitest/happy-dom)', async () => {
    await expect(readServiceWorkerVersion(undefined)).resolves.toBeUndefined()
  })

  it('posts a version request to the controller and resolves with its stamped reply', async () => {
    const controller = {
      postMessage: vi.fn((_message: unknown, transfer: Transferable[]) => {
        const port = transfer[0] as MessagePort
        port.postMessage({ version: 'abc1234' })
      }),
    }

    await expect(readServiceWorkerVersion({ controller: controller as unknown as ServiceWorker })).resolves.toBe(
      'abc1234',
    )
    expect(controller.postMessage).toHaveBeenCalledWith({ type: 'version' }, expect.any(Array))
  })
})

describe('usePwa: service worker version (issue #45)', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', originalDescriptor)
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })

  it('has no swVersion when nothing controls the page, e.g. Vitest/happy-dom', async () => {
    const [pwa] = withSetup(() => usePwa())
    await flushPromises()

    expect(pwa.swVersion.value).toBeUndefined()
  })

  it('a phone with a stale worker keeps showing its old build id until the update toast is accepted', async () => {
    const controller = {
      postMessage: vi.fn((_message: unknown, transfer: Transferable[]) => {
        const port = transfer[0] as MessagePort
        port.postMessage({ version: 'stale-abc1234' })
      }),
    }
    Object.defineProperty(navigator, 'serviceWorker', { value: { controller }, configurable: true })

    const [pwa] = withSetup(() => usePwa())
    await flushPromises()

    // The reply is the *old* worker's id: reopening a phone without
    // accepting UpdateToast's reload never queries a different controller
    // (Architecture.md §9) -- only the accepted reload swaps it in.
    expect(pwa.swVersion.value).toBe('stale-abc1234')
  })
})

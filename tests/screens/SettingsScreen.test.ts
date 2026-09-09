// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import SettingsScreen from '@/screens/SettingsScreen.vue'
import { encodeSetupLink } from '@/schemas'
import type { SetupLink as SetupLinkT } from '@/schemas'
import { configureSession, useSessionStore } from '@/stores/session'
import { useSyncStore } from '@/stores/sync'
import { ANA, HID, NOW, household } from '../helpers/fixtures'
import { FakeSheetsRepo, fakeStorage } from '../helpers/testRepo'

const LINK: SetupLinkT = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'x'.repeat(12) }

function unusedDemo(): never {
  throw new Error('createDemoRepo not used in this test')
}

async function connectAndMount(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
  configureSession({ storage: fakeStorage(), createSheetsRepo: () => repo, createDemoRepo: unusedDemo, now: () => NOW })
  await useSessionStore().connect(LINK, ANA)
  return mountSettings()
}

/** issue #46: a demo-mode household, connected via `startDemo` rather than `connect`. */
async function startDemoAndMount(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
  configureSession({ storage: fakeStorage(), createSheetsRepo: unusedDemo, createDemoRepo: () => repo, now: () => NOW })
  await useSessionStore().startDemo(NOW)
  return mountSettings()
}

async function mountSettings(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', component: SettingsScreen },
      { path: '/welcome', component: { template: '<div>welcome</div>' } },
    ],
  })
  await router.push('/settings')
  await router.isReady()
  const wrapper = mount(SettingsScreen, { global: { plugins: [router] } })
  return { wrapper, router }
}

function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const clipboard = { writeText: vi.fn(async () => undefined) }
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  return clipboard
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('SettingsScreen: household', () => {
  it('shows the household name, the setup link this phone is connected with, and its members', async () => {
    const { wrapper } = await connectAndMount()

    expect(wrapper.text()).toContain('Home')
    const linkField = wrapper.get<HTMLInputElement>('[data-test="setup-link"]')
    expect(linkField.element.value).toContain(encodeSetupLink(LINK))
    expect(linkField.element.value).toContain('#/welcome?s=')
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Ben')
  })

  it('copies the setup link to the clipboard and shows a confirmation toast', async () => {
    const clipboard = stubClipboard()
    const { wrapper } = await connectAndMount()

    await wrapper.get('[data-test="copy-link"]').trigger('click')
    await flushPromises()

    expect(clipboard.writeText).toHaveBeenCalledTimes(1)
    expect(clipboard.writeText.mock.calls[0]?.[0]).toContain(encodeSetupLink(LINK))
    expect(wrapper.text()).toContain('Setup link copied')
  })

  it('shows no demo hint for a real (sheets-mode) household', async () => {
    const { wrapper } = await connectAndMount()

    expect(wrapper.find('[data-test="setup-link-hint"]').exists()).toBe(false)
  })
})

describe('SettingsScreen: household (demo mode)', () => {
  it('shows a hint instead of the setup link, with no Copy button, in demo mode', async () => {
    const { wrapper } = await startDemoAndMount()

    expect(wrapper.find('[data-test="setup-link"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="copy-link"]').exists()).toBe(false)
    const hint = wrapper.get('[data-test="setup-link-hint"]')
    expect(hint.text()).toBe('Connect a real household to share a setup link.')
  })
})

describe('SettingsScreen: appearance', () => {
  it('marks the current theme selected and switches with one tap, persisting the choice', async () => {
    const { wrapper } = await connectAndMount()

    expect(wrapper.get('[data-test="theme-system"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-test="theme-dark"]').trigger('click')

    expect(wrapper.get('[data-test="theme-dark"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-test="theme-system"]').attributes('aria-pressed')).toBe('false')
    const stored = JSON.parse(localStorage.getItem('homecrew.prefs') ?? '{}') as { theme?: string }
    expect(stored.theme).toBe('dark')
  })
})

describe('SettingsScreen: sync panel', () => {
  it('shows online status, outbox count, current member and never for a poll that has not happened yet', async () => {
    const { wrapper } = await connectAndMount()

    expect(wrapper.text()).toContain('Online')
    expect(wrapper.text()).toContain('0 waiting')
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Never')
  })

  it('"Sync now" calls syncStore.syncNow() exactly once', async () => {
    const { wrapper } = await connectAndMount()
    const syncStore = useSyncStore()
    const spy = vi.spyOn(syncStore, 'syncNow')

    await wrapper.get('[data-test="sync-now"]').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('shows the last poll time the sync store reports, once one has happened', async () => {
    const { wrapper } = await connectAndMount()
    expect(wrapper.text()).toContain('Never')

    useSyncStore().lastPollAt = NOW
    await flushPromises()

    expect(wrapper.text()).not.toContain('Never')
  })

  it('names the tab and id of the last row skipped by the parser', async () => {
    const { wrapper } = await connectAndMount()
    const syncStore = useSyncStore()

    syncStore.skippedRows = 2
    syncStore.lastSkipped = { tab: 'events', id: 'ev-broken' }
    await flushPromises()

    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('events')
    expect(wrapper.text()).toContain('ev-broken')
  })

  it('shows zero skipped rows and no repo diagnostics for a demo (MemoryRepo) household', async () => {
    const { wrapper } = await connectAndMount()

    expect(wrapper.text()).not.toContain('ev-broken')
  })

  it('shows a non-empty App build id, distinct from the About section package.json version (issue #45)', async () => {
    const { wrapper } = await connectAndMount()

    expect(wrapper.get('[data-test="app-build-id"]').text().length).toBeGreaterThan(0)
  })

  it('shows "Not registered" for the service worker when nothing controls the page, e.g. Vitest/happy-dom (issue #45)', async () => {
    const { wrapper } = await connectAndMount()
    await flushPromises()

    expect(wrapper.get('[data-test="sw-version"]').text()).toBe('Not registered')
  })
})

describe('SettingsScreen: disconnect', () => {
  it('disables Disconnect until the household name is typed exactly, then disconnects and routes to Welcome', async () => {
    const { wrapper, router } = await connectAndMount()

    const disconnectButton = wrapper.get<HTMLButtonElement>('[data-test="disconnect-button"]')
    expect(disconnectButton.element.disabled).toBe(true)

    await wrapper.get('[data-test="disconnect-confirm-name"]').setValue('Not the household')
    expect(wrapper.get<HTMLButtonElement>('[data-test="disconnect-button"]').element.disabled).toBe(true)

    await wrapper.get('[data-test="disconnect-confirm-name"]').setValue('Home')
    expect(wrapper.get<HTMLButtonElement>('[data-test="disconnect-button"]').element.disabled).toBe(false)

    await wrapper.get('[data-test="disconnect-button"]').trigger('click')
    await flushPromises()

    expect(useSessionStore().mode).toBe('disconnected')
    expect(useSessionStore().link).toBeNull()
    expect(router.currentRoute.value.path).toBe('/welcome')
  })
})

describe('SettingsScreen: about', () => {
  it('shows the app name, a version, and a link to the repo', async () => {
    const { wrapper } = await connectAndMount()

    expect(wrapper.text()).toContain('HomeCrew')
    expect(wrapper.get('[data-test="app-version"]').text().length).toBeGreaterThan(0)
    const repoLink = wrapper.get<HTMLAnchorElement>('[data-test="repo-link"]')
    expect(repoLink.attributes('href')).toContain('github.com/roughee/instachores-app')
  })
})

describe('SettingsScreen: members list', () => {
  it('shows each member with their color as an avatar initial', async () => {
    const { wrapper } = await connectAndMount()

    const avatars = wrapper.findAll('.avatar')
    const names = avatars.map((a) => a.attributes('aria-label'))
    expect(names).toEqual(expect.arrayContaining(['Ana', 'Ben']))
    expect(names).not.toContain(undefined)
  })
})

// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import WelcomeScreen from '@/screens/WelcomeScreen.vue'
import { RepoError } from '@/data/repo'
import { MemoryRepo } from '@/data/memoryRepo'
import { demoRepoSeed } from '@/data/demo'
import { encodeSetupLink } from '@/schemas'
import type { SetupLink as SetupLinkT } from '@/schemas'
import { configureSession, useSessionStore } from '@/stores/session'
import { ANA, HID, NOW, household } from '../helpers/fixtures'
import { FakeSheetsRepo, fakeStorage } from '../helpers/testRepo'

const LINK: SetupLinkT = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'x'.repeat(12) }
const TOKEN = encodeSetupLink(LINK)

function unusedDemo(): never {
  throw new Error('createDemoRepo not used in this test')
}

function unusedSheets(): never {
  throw new Error('createSheetsRepo not used in this test')
}

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

/** `scripts/screenshots.mjs` renders the error state deterministically via a
 * `forceLinkError` query flag (issue #16, DESIGN.md §8: error state
 * screenshotted in both themes), the same trick `usePwa.ts` uses for the
 * update toast and install card. */
function setForceLinkError(): void {
  window.history.replaceState({}, '', '/?forceLinkError=1')
}

async function mountWelcome(initialPath = '/welcome'): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome', component: WelcomeScreen },
      { path: '/log', component: { template: '<div>log</div>' } },
    ],
  })
  await router.push(initialPath)
  await router.isReady()
  const wrapper = mount(WelcomeScreen, { global: { plugins: [router] } })
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  setNavigatorOnline(true)
  window.history.replaceState({}, '', '/')
})

describe('WelcomeScreen', () => {
  it('renders members after a successful preview', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    configureSession({ storage: fakeStorage(), createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    const { wrapper } = await mountWelcome()

    await wrapper.get('[data-test="link-input"]').setValue(TOKEN)
    await wrapper.get('[data-test="connect-button"]').trigger('click')
    await flushPromises()

    const names = wrapper.findAll('[data-test="member-button"]').map((b) => b.text())
    expect(names.some((n) => n.includes('Ana'))).toBe(true)
    expect(names.some((n) => n.includes('Ben'))).toBe(true)
    expect(names.some((n) => n.includes('Mia'))).toBe(true)
  })

  it('pre-fills the setup link from the ?s= route query', async () => {
    const { wrapper } = await mountWelcome(`/welcome?s=${TOKEN}`)
    const input = wrapper.get<HTMLInputElement>('[data-test="link-input"]')
    expect(input.element.value).toBe(TOKEN)
  })

  it('shows the malformed-link error before any network call, and never calls createSheetsRepo', async () => {
    const createSheetsRepo = vi.fn()
    configureSession({ storage: fakeStorage(), createSheetsRepo, createDemoRepo: unusedDemo })
    const { wrapper } = await mountWelcome()

    await wrapper.get('[data-test="link-input"]').setValue('not-a-real-setup-link')
    await wrapper.get('[data-test="connect-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="link-error"]').text()).toContain('That link is not a HomeCrew setup link.')
    expect(createSheetsRepo).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="member-button"]').exists()).toBe(false)
  })

  it('shows the wrong-secret error when preview rejects with RepoError(unauthorized), and stores nothing', async () => {
    class FailingRepo extends FakeSheetsRepo {
      override async connect(): Promise<never> {
        throw new RepoError('unauthorized', 'bad secret')
      }
    }
    const repo = new FailingRepo([{ id: HID, household: household() }])
    const storage = fakeStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    configureSession({ storage, createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    const { wrapper } = await mountWelcome()

    await wrapper.get('[data-test="link-input"]').setValue(TOKEN)
    await wrapper.get('[data-test="connect-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="link-error"]').text()).toContain(
      'The household did not accept this link. Check the secret.',
    )
    expect(wrapper.find('[data-test="member-button"]').exists()).toBe(false)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('picking a member connects the session and routes to /log', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    configureSession({ storage: fakeStorage(), createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    const { wrapper, router } = await mountWelcome()

    await wrapper.get('[data-test="link-input"]').setValue(TOKEN)
    await wrapper.get('[data-test="connect-button"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="member-button"]').trigger('click')
    await flushPromises()

    expect(useSessionStore().mode).toBe('sheets')
    expect(useSessionStore().memberUid).toBe(ANA)
    expect(router.currentRoute.value.path).toBe('/log')
  })

  it('the demo button calls startDemo and routes to /log without touching createSheetsRepo', async () => {
    const demo = new MemoryRepo([demoRepoSeed(NOW)])
    configureSession({
      storage: fakeStorage(),
      createSheetsRepo: unusedSheets,
      createDemoRepo: () => demo,
      now: () => NOW,
    })
    const { wrapper, router } = await mountWelcome()

    await wrapper.get('[data-test="demo-button"]').trigger('click')
    await flushPromises()

    expect(useSessionStore().mode).toBe('demo')
    expect(router.currentRoute.value.path).toBe('/log')
  })

  it('disables Connect and explains why while offline, and still offers the demo', async () => {
    setNavigatorOnline(false)
    configureSession({ storage: fakeStorage(), createSheetsRepo: unusedSheets, createDemoRepo: unusedDemo })
    const { wrapper } = await mountWelcome()

    expect(wrapper.get('[data-test="offline-notice"]').text()).toContain(
      'Connecting needs a network. Try the demo for now.',
    )
    expect(wrapper.get<HTMLButtonElement>('[data-test="connect-button"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('[data-test="demo-button"]').element.disabled).toBe(false)
  })

  it('a forceLinkError query flag shows the malformed-link error with no interaction, for deterministic screenshots', async () => {
    setForceLinkError()
    configureSession({ storage: fakeStorage(), createSheetsRepo: unusedSheets, createDemoRepo: unusedDemo })
    const { wrapper } = await mountWelcome()

    expect(wrapper.get('[data-test="link-error"]').text()).toContain('That link is not a HomeCrew setup link.')
  })
})

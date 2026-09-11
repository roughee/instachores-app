// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

// `virtual:pwa-register/vue` only exists once vite-plugin-pwa's Vite plugin
// runs; under Vitest it must be mocked so App.vue (via usePwa) can import it.
vi.mock('virtual:pwa-register/vue', () => ({
  useRegisterSW: () => ({ needRefresh: { value: false }, updateServiceWorker: vi.fn() }),
}))

import App from '@/App.vue'
import { useCelebration } from '@/composables/useCelebration'
import { useSessionStore } from '@/stores/session'
import { useSyncStore } from '@/stores/sync'

async function mountApp() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/log', component: { template: '<div />' } },
      { path: '/today', component: { template: '<div />' } },
      { path: '/overview', component: { template: '<div />' } },
      { path: '/rewards', component: { template: '<div />' } },
    ],
  })
  await router.push('/log')
  await router.isReady()
  return mount(App, { global: { plugins: [router] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.history.replaceState({}, '', '/')
  useCelebration().clear()
})

/**
 * The status strip (issue #16): "Demo" with a `--warn` dot in demo mode,
 * otherwise "Up to date" / "Offline" / "Syncing" from the sync store.
 */
describe('App status strip', () => {
  it('shows "Up to date" with a plain dot by default', async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain('Up to date')
    expect(wrapper.find('.app-shell__status-dot--warn').exists()).toBe(false)
  })

  it('shows "Demo" with a warn dot when the session is in demo mode', async () => {
    const wrapper = await mountApp()
    useSessionStore().mode = 'demo'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Demo')
    expect(wrapper.find('.app-shell__status-dot--warn').exists()).toBe(true)
  })

  it('shows "Offline" with a warn dot when the sync store reports offline', async () => {
    const wrapper = await mountApp()
    useSyncStore().online = false
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Offline')
    expect(wrapper.find('.app-shell__status-dot--warn').exists()).toBe(true)
  })

  it('shows "Syncing" while online with a nonzero outbox count', async () => {
    const wrapper = await mountApp()
    useSyncStore().outboxCount = 3
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Syncing')
  })

  it('demo mode wins over the sync store state', async () => {
    const wrapper = await mountApp()
    useSyncStore().online = false
    useSessionStore().mode = 'demo'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Demo')
    expect(wrapper.text()).not.toContain('Offline')
  })
})

/**
 * `?forceCelebration=<id>` (issue #53, same pattern as `forceUpdateToast`):
 * lets `scripts/screenshots.mjs` capture a specific one of the ten moments
 * instead of whichever one the random pick lands on.
 */
describe('App forceCelebration flag', () => {
  it('a forceCelebration query flag sets that exact moment, for deterministic screenshots', async () => {
    window.history.replaceState({}, '', '/?forceCelebration=star-catch')

    await mountApp()

    expect(useCelebration().celebration.value?.id).toBe('star-catch')
  })

  it('an unknown forceCelebration value is ignored', async () => {
    window.history.replaceState({}, '', '/?forceCelebration=not-a-real-id')

    await mountApp()

    expect(useCelebration().celebration.value).toBeUndefined()
  })

  it('with no flag, nothing is celebrating on load', async () => {
    await mountApp()

    expect(useCelebration().celebration.value).toBeUndefined()
  })
})

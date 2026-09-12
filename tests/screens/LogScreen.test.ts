// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/router'
import { MemoryRepo } from '@/data/memoryRepo'
import { SEED_IDS } from '@/domain/seed'
import { configureSession, useSessionStore } from '@/stores/session'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { useSyncStore } from '@/stores/sync'
import LogScreen from '@/screens/LogScreen.vue'
import { ANA, HID, NOW, TZ, household, task } from '../helpers/fixtures'
import { idCounter } from '../helpers/testRepo'

// Issue #53: LogScreen triggers a celebration right next to its toast, on
// the shared composable singleton -- mocked here so the assertion below is
// about the call, not about which of the ten moments happened to render.
const triggerSpy = vi.fn()
vi.mock('@/composables/useCelebration', () => ({
  useCelebration: () => ({ celebration: { value: undefined }, trigger: triggerSpy, clear: vi.fn() }),
}))

function unused(): never {
  throw new Error('not used in this test file')
}

function bindAll(repo: MemoryRepo, now: () => Date) {
  const householdStore = useHouseholdStore()
  const catalogStore = useCatalogStore()
  const eventsStore = useEventsStore()
  const syncStore = useSyncStore()
  householdStore.bind(repo, HID)
  catalogStore.bind(repo, HID)
  eventsStore.bind(repo, HID, { tz: TZ, now })
  syncStore.bind(repo)
  return { householdStore, catalogStore, eventsStore, syncStore }
}

async function testRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/log')
  await router.isReady()
  return router
}

let clock = NOW

beforeEach(() => {
  setActivePinia(createPinia())
  triggerSpy.mockClear()
  clock = NOW
  configureSession({
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    createSheetsRepo: unused,
    createDemoRepo: unused,
    now: () => clock,
    ids: idCounter('ev'),
  })
})

function quickDefaultTasks() {
  return [
    task({ id: SEED_IDS.pots, name: 'Pots', category: 'kitchen', points: 2 }),
    task({ id: SEED_IDS.counters, name: 'Clean kitchen counters', category: 'kitchen', points: 3 }),
    task({ id: SEED_IDS.trash, name: 'Take out trash / recycling', category: 'kitchen', points: 2 }),
  ]
}

describe('LogScreen', () => {
  it('shows the household bar, the seeded quick row and the category grid on the first day', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter()

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('0 / 250')
    expect(wrapper.text()).toContain('You today: 0 pts')
    expect(wrapper.text()).toContain('Pots')
    expect(wrapper.text()).toContain('Clean kitchen counters')
    expect(wrapper.text()).toContain('Take out trash')
    expect(wrapper.text()).toContain('Kitchen')
    expect(wrapper.text()).toContain('Laundry')
  })

  it('tapping a quick task logs it, updates the bar in the same frame, and opens the Next time sheet', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter()

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-button"]').trigger('click')

    expect(wrapper.text()).toContain('2 / 250')
    expect(eventsStore.events.filter((e) => e.type === 'complete')).toHaveLength(1)
    expect(triggerSpy).toHaveBeenCalledTimes(1)
    expect(triggerSpy).toHaveBeenCalledWith('var(--cat-kitchen)')

    // No toast until the sheet closes -- Undo's window must still be open then.
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Pots logged')
  })

  it('shows the toast with Undo once the Next time sheet closes (Not now)', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter()

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-button"]').trigger('click')
    await wrapper.get('[data-test="next-time-not-now"]').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    const status = wrapper.get('[role="status"]')
    expect(status.text()).toContain('Pots logged')
    expect(status.text()).toContain('Undo')

    await status.get('button').trigger('click')

    expect(eventsStore.events.some((e) => e.type === 'undo')).toBe(true)
    expect(wrapper.text()).toContain('0 / 250')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('choosing Schedule calls scheduleNext with the completion id and the selected days, then shows the toast', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter()
    const scheduleNextSpy = vi.spyOn(eventsStore, 'scheduleNext')

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-button"]').trigger('click')
    const completeEventId = eventsStore.recentlyLogged?.eventId
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')

    expect(scheduleNextSpy).toHaveBeenCalledWith(completeEventId, 1)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toContain('Pots logged')
  })

  it('a second completion replaces the toast instead of queueing it', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter()

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })
    const buttons = wrapper.findAll('[data-test="task-button"]')
    await buttons[0]!.trigger('click')
    await wrapper.get('[data-test="next-time-not-now"]').trigger('click')
    await buttons[1]!.trigger('click')
    await wrapper.get('[data-test="next-time-not-now"]').trigger('click')

    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
    expect(wrapper.get('[role="status"]').text()).toContain('Clean kitchen counters')
  })

  it('shows the category tile’s completion count after logging', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter()

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-button"]').trigger('click')

    const kitchenTile = wrapper.findAll('a').find((a) => a.attributes('href')?.includes('/log/kitchen'))
    expect(kitchenTile?.text()).toContain('1')
  })

  it('shows a pending outbox count line when offline', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    const { syncStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    syncStore.$patch({ online: false, outboxCount: 3 })
    const router = await testRouter()

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('3 waiting to sync')
  })

  it('has no waiting-to-sync line when the outbox is empty', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: quickDefaultTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter()

    const wrapper = mount(LogScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).not.toContain('waiting to sync')
  })
})

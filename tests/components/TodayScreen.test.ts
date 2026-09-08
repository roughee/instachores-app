// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TodayScreen from '@/screens/TodayScreen.vue'
import { MemoryRepo } from '@/data/memoryRepo'
import { routes } from '@/router'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { ANA, BEN, HID, NOW, complete, event, household, task } from '../helpers/fixtures'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes })
}

function bind(repo: MemoryRepo) {
  const householdStore = useHouseholdStore()
  const catalogStore = useCatalogStore()
  const eventsStore = useEventsStore()
  householdStore.bind(repo, HID)
  catalogStore.bind(repo, HID)
  eventsStore.bind(repo, HID, { tz: household().tz, now: () => NOW })
  return { householdStore, catalogStore, eventsStore }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('TodayScreen', () => {
  it('renders an hour heading and a row for each of today’s completes', async () => {
    const pots = task({ id: 'task-pots', name: 'Pots', points: 4 })
    const potsEvent = complete(pots, { forUid: ANA, at: NOW })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots], events: [potsEvent] }])
    bind(repo)
    const router = makeRouter()
    await router.push('/today')

    const wrapper = mount(TodayScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Pots')
    expect(wrapper.text()).toContain('21:00')
    expect(wrapper.text()).toContain('4')
  })

  it('shows an undone row struck through', async () => {
    const pots = task({ id: 'task-pots', name: 'Pots', points: 4 })
    const potsEvent = complete(pots, { forUid: ANA, at: NOW })
    const undo = event('undo', { refEventId: potsEvent.id, at: new Date(NOW.getTime() + 1000) })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots], events: [potsEvent, undo] }])
    bind(repo)
    const router = makeRouter()
    await router.push('/today')

    const wrapper = mount(TodayScreen, { global: { plugins: [router] } })

    expect(wrapper.get('.today-row').classes()).toContain('today-row--undone')
  })

  it('shows the empty state when nothing was logged today', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    bind(repo)
    const router = makeRouter()
    await router.push('/today')

    const wrapper = mount(TodayScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Quiet so far')
  })

  it('routes to /log when the empty state’s action is used', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    bind(repo)
    const router = makeRouter()
    await router.push('/today')

    const wrapper = mount(TodayScreen, { global: { plugins: [router] } })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/log'))
  })

  it('adds a new row reactively without a reload when the store gains an event', async () => {
    const pots = task({ id: 'task-pots', name: 'Pots', points: 4 })
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [pots] }])
    bind(repo)
    const router = makeRouter()
    await router.push('/today')

    const wrapper = mount(TodayScreen, { global: { plugins: [router] } })
    expect(wrapper.text()).toContain('Quiet so far')

    await repo.appendEvent(HID, complete(pots, { forUid: BEN, at: NOW }))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Pots')
  })
})

// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { MemoryRepo } from '@/data/memoryRepo'
import OverviewScreen from '@/screens/OverviewScreen.vue'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { ANA, HID, NOW, TZ, complete, household, task } from '../helpers/fixtures'

function bindAll(repo: MemoryRepo) {
  const householdStore = useHouseholdStore()
  const catalogStore = useCatalogStore()
  const eventsStore = useEventsStore()
  householdStore.bind(repo, HID)
  catalogStore.bind(repo, HID)
  eventsStore.bind(repo, HID, { tz: TZ, now: () => NOW })
  return { householdStore, catalogStore, eventsStore }
}

describe('OverviewScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows the empty state when the week has no events', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    bindAll(repo)

    const wrapper = mount(OverviewScreen)

    expect(wrapper.text()).toContain('Nothing logged this week')
  })

  it('shows the household bar and member split when the week has events', () => {
    const pots = task({ id: 'task-pots', points: 4, category: 'kitchen' })
    const repo = new MemoryRepo([
      { id: HID, household: household(), tasks: [pots], events: [complete(pots, { forUid: ANA, points: 4 })] },
    ])
    bindAll(repo)

    const wrapper = mount(OverviewScreen)

    expect(wrapper.text()).not.toContain('Nothing logged this week')
    // NOW is Wednesday: elapsedDays 3 of 7, pro-rated target = round(250*3/7) = 107.
    expect(wrapper.text()).toContain('4 / 107')
    expect(wrapper.text()).toContain('Ana')
  })

  it('steps to the previous week and back with the nav arrows', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const { eventsStore } = bindAll(repo)

    const wrapper = mount(OverviewScreen)
    await wrapper.get('[aria-label="Previous week"]').trigger('click')
    expect(eventsStore.weekOffset).toBe(-1)

    await wrapper.get('[aria-label="Next week"]').trigger('click')
    expect(eventsStore.weekOffset).toBe(0)
    expect(wrapper.get('[aria-label="Next week"]').attributes('disabled')).toBeDefined()
  })
})

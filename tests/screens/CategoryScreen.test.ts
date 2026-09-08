// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/router'
import { MemoryRepo } from '@/data/memoryRepo'
import { configureSession, useSessionStore } from '@/stores/session'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { useSyncStore } from '@/stores/sync'
import CategoryScreen from '@/screens/CategoryScreen.vue'
import { ANA, BEN, HID, NOW, TZ, household, task } from '../helpers/fixtures'
import { idCounter } from '../helpers/testRepo'

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

async function testRouter(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  return router
}

let clock = NOW

beforeEach(() => {
  setActivePinia(createPinia())
  clock = NOW
  configureSession({
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    createSheetsRepo: unused,
    createDemoRepo: unused,
    now: () => clock,
    ids: idCounter('ev'),
  })
})

function kitchenTasks() {
  return [
    task({ id: 'task-cook-dinner', name: 'Cook dinner', category: 'kitchen', points: 6, sort: 0 }),
    task({ id: 'task-hand-wash', name: 'Hand-wash dishes', category: 'kitchen', points: 0, sort: 1 }),
    task({ id: 'task-pots', name: 'Pots', category: 'kitchen', points: 2, sort: 2, parentId: 'task-hand-wash' }),
    task({ id: 'task-pans', name: 'Pans', category: 'kitchen', points: 2, sort: 3, parentId: 'task-hand-wash' }),
    task({ id: 'task-counters', name: 'Clean kitchen counters', category: 'kitchen', points: 3, sort: 4 }),
  ]
}

function bathroomTasks() {
  return [
    task({ id: 'task-bathroom', name: 'Clean bathroom', category: 'bathroom', points: 0, comboBonus: 2, sort: 0 }),
    task({ id: 'task-toilet', name: 'Toilet', category: 'bathroom', points: 4, sort: 1, parentId: 'task-bathroom' }),
    task({ id: 'task-sink', name: 'Sink', category: 'bathroom', points: 2, sort: 2, parentId: 'task-bathroom' }),
    task({ id: 'task-shower', name: 'Shower', category: 'bathroom', points: 4, sort: 3, parentId: 'task-bathroom' }),
  ]
}

describe('CategoryScreen', () => {
  it('renders a TaskGroup for a group task and TaskButtons for the rest, in sort order', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: kitchenTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/kitchen')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Kitchen')
    expect(wrapper.text()).toContain('Cook dinner')
    expect(wrapper.text()).toContain('Hand-wash dishes')
    expect(wrapper.text()).toContain('Pots')
    expect(wrapper.text()).toContain('Pans')
    expect(wrapper.text()).toContain('Clean kitchen counters')
    expect(wrapper.findAll('[data-test="task-button"]')).toHaveLength(2)
  })

  it('tapping a sub-item chip creates one complete event for that sub-item only', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: kitchenTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/kitchen')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-group-chip"]').trigger('click')

    const completes = eventsStore.events.filter((e) => e.type === 'complete')
    expect(completes).toHaveLength(1)
    expect(completes[0]?.taskId).toBe('task-pots')
  })

  it('tapping the same chip twice shows a x2 badge, and Undo removes the last event', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: kitchenTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/kitchen')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    const chip = () => wrapper.get('[data-test="task-group-chip"]')
    await chip().trigger('click')
    await chip().trigger('click')

    expect(eventsStore.events.filter((e) => e.type === 'complete')).toHaveLength(2)
    expect(wrapper.get('.task-group__chip-badge').text()).toBe('x2')

    await wrapper.get('[role="status"]').get('button').trigger('click')

    expect(eventsStore.events.filter((e) => e.type === 'complete')).toHaveLength(2)
    expect(eventsStore.events.some((e) => e.type === 'undo')).toBe(true)
    expect(wrapper.find('.task-group__chip-badge').exists()).toBe(false)
  })

  it('Do all on a combo group appends one complete per active sub-item plus one bonus, and a second tap does not duplicate the bonus', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: bathroomTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/bathroom')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-group-do-all"]').trigger('click')

    expect(eventsStore.events.filter((e) => e.type === 'complete')).toHaveLength(3)
    expect(eventsStore.events.filter((e) => e.type === 'bonus')).toHaveLength(1)

    await wrapper.get('[data-test="task-group-do-all"]').trigger('click')

    expect(eventsStore.events.filter((e) => e.type === 'bonus')).toHaveLength(1)
    expect(eventsStore.events.filter((e) => e.type === 'complete')).toHaveLength(6)
  })

  it('shows two avatar dots for a task already done today by both adults, and it stays tappable', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: kitchenTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/kitchen')

    await eventsStore.complete('task-counters')
    await eventsStore.complete('task-counters', { forUid: BEN })

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    expect(wrapper.findAll('.task-button__avatar')).toHaveLength(2)

    const button = wrapper.findAll('[data-test="task-button"]').find((b) => b.text().includes('Clean kitchen'))!
    await button.trigger('click')
    expect(eventsStore.events.filter((e) => e.type === 'complete' && e.taskId === 'task-counters')).toHaveLength(3)
  })

  it('shows the empty state with one action when the category has no tasks', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: [] }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/admin')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('No tasks')
    expect(wrapper.get('a').attributes('href')).toContain('/log')
  })

  it('shows a "no such category" state with a Log action for an unknown category', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/not-a-category')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('No such category')
    expect(wrapper.get('a').attributes('href')).toContain('/log')
  })
})

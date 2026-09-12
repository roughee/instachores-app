// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

// Issue #53: CategoryScreen triggers a celebration right next to its toast,
// on the shared composable singleton -- mocked here so the assertion below
// is about the call, not about which of the ten moments happened to render.
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

async function testRouter(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
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
    task({
      id: 'task-bathroom',
      name: 'Clean bathroom',
      category: 'bathroom',
      points: 0,
      comboBonus: 2,
      sort: 0,
      freq: 'weekly',
      intervalDays: 7,
    }),
    task({ id: 'task-toilet', name: 'Toilet', category: 'bathroom', points: 4, sort: 1, parentId: 'task-bathroom' }),
    task({ id: 'task-sink', name: 'Sink', category: 'bathroom', points: 2, sort: 2, parentId: 'task-bathroom' }),
    task({ id: 'task-shower', name: 'Shower', category: 'bathroom', points: 4, sort: 3, parentId: 'task-bathroom' }),
  ]
}

function kidsTasks() {
  return [task({ id: 'task-kid-star', name: 'Put toys away', category: 'kids', points: 1, forRole: 'kid' })]
}

function floorsTasks() {
  return [
    task({ id: 'task-pick-up', name: 'Pick everything up off the floor', category: 'floors', points: 3, sort: 0 }),
    task({
      id: 'task-mop',
      name: 'Wet-mop floors',
      category: 'floors',
      points: 5,
      freq: 'weekly',
      intervalDays: 5,
      sort: 1,
    }),
    task({
      id: 'task-vacuum',
      name: 'Vacuum whole home',
      category: 'floors',
      points: 5,
      freq: 'weekly',
      intervalDays: 3,
      sort: 2,
    }),
    task({ id: 'task-dust', name: 'Dust shelves and surfaces', category: 'floors', points: 3, sort: 3 }),
  ]
}

function carTasks() {
  return [
    task({ id: 'task-car-wash', name: 'Car wash', category: 'car', points: 5, sort: 0 }),
    task({ id: 'task-car-carpets', name: 'Car carpets', category: 'car', points: 4, sort: 1 }),
    task({ id: 'task-car-trunk', name: 'Car trunk cleanout', category: 'car', points: 3, sort: 2 }),
  ]
}

const DAY_MS = 86_400_000

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
    expect(triggerSpy).toHaveBeenCalledTimes(1)
    expect(triggerSpy).toHaveBeenCalledWith('var(--cat-kitchen)')

    // A sub-item chip tap never opens the Next time sheet (issue #69); the
    // toast shows right away, same as before.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toContain('Pots logged')
  })

  it('tapping a plain TaskButton opens the Next time sheet, preselected from the task', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: kitchenTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/kitchen')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    const button = wrapper.findAll('[data-test="task-button"]').find((b) => b.text().includes('Cook dinner'))!
    await button.trigger('click')

    expect(eventsStore.events.filter((e) => e.type === 'complete')).toHaveLength(1)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Cook dinner logged')
  })

  it('choosing Schedule on a plain task calls scheduleNext with the completion id and days, then shows the toast', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: kitchenTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/kitchen')
    const scheduleNextSpy = vi.spyOn(eventsStore, 'scheduleNext')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    const button = wrapper.findAll('[data-test="task-button"]').find((b) => b.text().includes('Cook dinner'))!
    await button.trigger('click')
    const completeEventId = eventsStore.recentlyLogged?.eventId
    const sevenDaysChip = wrapper.findAll('[data-test="next-time-chip"]').find((c) => c.text() === '3 days')!
    await sevenDaysChip.trigger('click')
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')

    expect(scheduleNextSpy).toHaveBeenCalledWith(completeEventId, 3, 'task-cook-dinner')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toContain('Cook dinner logged')
  })

  it('never opens the sheet for a kid task', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: kidsTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/kids')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-button"]').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toContain('Put toys away logged')
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
    expect(triggerSpy).toHaveBeenCalledTimes(1)
    expect(triggerSpy).toHaveBeenCalledWith('var(--cat-bathroom)')

    await wrapper.get('[data-test="task-group-do-all"]').trigger('click')

    expect(eventsStore.events.filter((e) => e.type === 'bonus')).toHaveLength(1)
    expect(eventsStore.events.filter((e) => e.type === 'complete')).toHaveLength(6)
  })

  it('Do all opens the Next time sheet for the parent with the summed points', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: bathroomTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/bathroom')
    const scheduleNextSpy = vi.spyOn(eventsStore, 'scheduleNext')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="task-group-do-all"]').trigger('click')

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Clean bathroom logged')
    // toilet 4 + sink 2 + shower 4 + comboBonus 2 = 12
    expect(dialog.text()).toContain('+12 pts for Ana.')
    const sevenDays = wrapper.findAll('[data-test="next-time-chip"]').find((c) => c.text() === '7 days')!
    expect(sevenDays.attributes('aria-pressed')).toBe('true')

    const completeEventId = eventsStore.recentlyLogged?.eventId
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')
    // The parent's id, not the last sub-item's: the schedule is the group's.
    expect(scheduleNextSpy).toHaveBeenCalledWith(completeEventId, 7, 'task-bathroom')
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

  it('lists the three car tasks on #/log/car (issue #63)', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: carTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/car')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Car')
    expect(wrapper.text()).toContain('Car wash')
    expect(wrapper.text()).toContain('Car carpets')
    expect(wrapper.text()).toContain('Car trunk cleanout')
    expect(wrapper.findAll('[data-test="task-button"]')).toHaveLength(3)
    expect(wrapper.get('.category-screen__header').classes()).toContain('category-screen__header--car')
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

  it('an away task leaves the main list, shows in the Scheduled fold with a back label, and tapping it unschedules and toasts', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/floors')

    await eventsStore.complete('task-vacuum')
    const completeEventId = eventsStore.recentlyLogged?.eventId
    await eventsStore.scheduleNext(completeEventId!, 7)

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })

    expect(wrapper.findAll('[data-test="task-button"]').some((b) => b.text().includes('Vacuum whole home'))).toBe(false)
    const rows = wrapper.findAll('[data-test="scheduled-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Vacuum whole home')
    expect(rows[0]!.text()).toMatch(/back /)
    expect(wrapper.text()).toContain('Tap a scheduled task to bring it back early.')

    await rows[0]!.trigger('click')

    expect(eventsStore.events.some((e) => e.type === 'unschedule')).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('Vacuum whole home is back')
  })

  it('an away group parent folds as one row instead of its children', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: bathroomTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/bathroom')

    // Direct complete on the parent id (same as main.ts's `?demoSchedule=1`
    // flow), not "Do all": which sub-item's own complete a real "Do all"
    // schedules against is an existing #69 nuance, out of scope here.
    await eventsStore.complete('task-bathroom')
    const completeEventId = eventsStore.recentlyLogged?.eventId
    await eventsStore.scheduleNext(completeEventId!, 7)

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })

    expect(wrapper.find('[data-test="task-group-do-all"]').exists()).toBe(false)
    const rows = wrapper.findAll('[data-test="scheduled-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Clean bathroom')
  })

  it('a task due today shows its subline with no chip (mockup: gentle, not nagging)', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/floors')

    await eventsStore.complete('task-mop', { at: new Date(clock.getTime() - 5 * DAY_MS) })
    const completeEventId = eventsStore.recentlyLogged?.eventId
    await eventsStore.scheduleNext(completeEventId!, 5)

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    const button = wrapper.findAll('[data-test="task-button"]').find((b) => b.text().includes('Wet-mop floors'))!

    expect(button.find('.task-button__due').exists()).toBe(false)
    expect(button.get('.task-button__subline').text()).toBe('Due today. Last done 5 days ago by Ana')
  })

  it('an overdue task shows the Due <weekday> chip and its subline', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/floors')

    // Completed 9 days ago with a 5-day schedule: due 4 days ago (Sat), overdue as of NOW (Wed).
    await eventsStore.complete('task-mop', { at: new Date(clock.getTime() - 9 * DAY_MS) })
    const completeEventId = eventsStore.recentlyLogged?.eventId
    await eventsStore.scheduleNext(completeEventId!, 5)

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    const button = wrapper.findAll('[data-test="task-button"]').find((b) => b.text().includes('Wet-mop floors'))!

    expect(button.get('.task-button__due').text()).toBe('Due Sat')
    expect(button.get('.task-button__subline').text()).toBe('Due since Sat. Last done 9 days ago by Ana')
  })

  it('a listed task with a last completion shows the subline only, no chip', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/floors')

    await eventsStore.complete('task-dust', { at: new Date(clock.getTime() - 2 * DAY_MS) })

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    const button = wrapper
      .findAll('[data-test="task-button"]')
      .find((b) => b.text().includes('Dust shelves and surfaces'))!

    expect(button.get('.task-button__subline').text()).toBe('Last done 2 days ago by Ana')
    expect(button.find('.task-button__due').exists()).toBe(false)
  })

  it('a never-done listed task shows no subline and no chip', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/floors')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })
    const button = wrapper
      .findAll('[data-test="task-button"]')
      .find((b) => b.text().includes('Pick everything up off the floor'))!

    expect(button.find('.task-button__subline').exists()).toBe(false)
    expect(button.find('.task-button__due').exists()).toBe(false)
  })

  it('shows no Scheduled fold when nothing in the category is away', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/log/floors')

    const wrapper = mount(CategoryScreen, { global: { plugins: [router] } })

    expect(wrapper.find('.category-screen__scheduled').exists()).toBe(false)
  })
})

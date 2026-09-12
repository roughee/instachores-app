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
import ScheduleScreen from '@/screens/ScheduleScreen.vue'
import { ANA, BEN, HID, NOW, TZ, household, task } from '../helpers/fixtures'
import { idCounter } from '../helpers/testRepo'

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

const DAY_MS = 86_400_000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS)

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

function floorsTasks() {
  return [
    task({ id: 'task-mop', name: 'Wet-mop floors', category: 'floors', points: 5, freq: 'weekly', sort: 0 }),
    task({ id: 'task-vacuum', name: 'Vacuum whole home', category: 'floors', points: 5, freq: 'weekly', sort: 1 }),
  ]
}

function bathroomGroupTasks() {
  return [
    task({
      id: 'task-bathroom',
      name: 'Clean bathroom',
      category: 'bathroom',
      points: 0,
      comboBonus: 2,
      freq: 'weekly',
      sort: 0,
    }),
    task({ id: 'task-toilet', name: 'Toilet', category: 'bathroom', points: 4, sort: 1, parentId: 'task-bathroom' }),
    task({ id: 'task-sink', name: 'Sink', category: 'bathroom', points: 2, sort: 2, parentId: 'task-bathroom' }),
  ]
}

describe('ScheduleScreen', () => {
  it('shows the full empty state when nothing is scheduled and nothing was done recently', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    const router = await testRouter('/schedule')

    const wrapper = mount(ScheduleScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Schedule')
    expect(wrapper.text()).toContain('Nothing scheduled yet.')
    expect(wrapper.get('a, button.empty-state__action').text()).toContain('Log a task')
  })

  it('shows the "nothing coming up" hint above Recently done when only Upcoming is empty', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    await eventsStore.complete('task-mop', { at: daysAgo(1) })
    const router = await testRouter('/schedule')

    const wrapper = mount(ScheduleScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Nothing coming up. Log a task and pick its next time.')
    expect(wrapper.find('[data-test="schedule-row"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Recently done')
  })

  it('renders Today, Tomorrow and This week groups in order, each with a header', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA

    await eventsStore.complete('task-mop', { at: daysAgo(9) })
    const mopCompleteId = eventsStore.recentlyLogged!.eventId
    await eventsStore.scheduleNext(mopCompleteId, 5) // overdue: due 4 days ago -> Today

    await eventsStore.complete('task-vacuum', { at: NOW })
    const vacuumCompleteId = eventsStore.recentlyLogged!.eventId
    await eventsStore.scheduleNext(vacuumCompleteId, 1) // due tomorrow

    const router = await testRouter('/schedule')
    const wrapper = mount(ScheduleScreen, { global: { plugins: [router] } })
    const headers = wrapper.findAll('h2').map((h) => h.text())

    expect(headers).toEqual(['Today', 'Tomorrow', 'Recently done'])
    expect(wrapper.text()).toContain('Wet-mop floors')
    expect(wrapper.text()).toContain('Vacuum whole home')
  })

  it('tapping a plain row completes the task, celebrates and opens the Next time sheet', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    await eventsStore.complete('task-mop', { at: daysAgo(5) })
    const completeId = eventsStore.recentlyLogged!.eventId
    await eventsStore.scheduleNext(completeId, 5) // due today
    const router = await testRouter('/schedule')

    const wrapper = mount(ScheduleScreen, { global: { plugins: [router] } })
    const row = wrapper.get('[data-test="schedule-row"]')
    await row.trigger('click')

    const completes = eventsStore.events.filter((e) => e.type === 'complete' && e.taskId === 'task-mop')
    expect(completes).toHaveLength(2)
    expect(triggerSpy).toHaveBeenCalledTimes(1)
    expect(triggerSpy).toHaveBeenCalledWith('var(--cat-floors)')
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Wet-mop floors logged')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('choosing Schedule on the sheet calls scheduleNext and then shows the queued toast', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    await eventsStore.complete('task-mop', { at: daysAgo(5) })
    const completeId = eventsStore.recentlyLogged!.eventId
    await eventsStore.scheduleNext(completeId, 5)
    const router = await testRouter('/schedule')
    const scheduleNextSpy = vi.spyOn(eventsStore, 'scheduleNext')

    const wrapper = mount(ScheduleScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="schedule-row"]').trigger('click')
    const newCompleteId = eventsStore.recentlyLogged?.eventId
    const threeDays = wrapper.findAll('[data-test="next-time-chip"]').find((c) => c.text() === '3 days')!
    await threeDays.trigger('click')
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')

    expect(scheduleNextSpy).toHaveBeenCalledWith(newCompleteId, 3)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toContain('Wet-mop floors logged')
  })

  it('tapping a group row completes every active sub-item plus the combo bonus and opens the sheet with the summed points', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: bathroomGroupTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    await eventsStore.complete('task-bathroom', { at: daysAgo(9) })
    const completeId = eventsStore.recentlyLogged!.eventId
    await eventsStore.scheduleNext(completeId, 7) // overdue
    const router = await testRouter('/schedule')

    const wrapper = mount(ScheduleScreen, { global: { plugins: [router] } })
    await wrapper.get('[data-test="schedule-row"]').trigger('click')

    expect(eventsStore.events.filter((e) => e.type === 'complete' && e.taskId === 'task-toilet')).toHaveLength(1)
    expect(eventsStore.events.filter((e) => e.type === 'complete' && e.taskId === 'task-sink')).toHaveLength(1)
    expect(eventsStore.events.filter((e) => e.type === 'bonus')).toHaveLength(1)
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Clean bathroom logged')
    // toilet 4 + sink 2 + comboBonus 2 = 8
    expect(dialog.text()).toContain('+8 pts for Ana.')
  })

  it('shows Recently done rows with the member, time and back label', async () => {
    const repo = new MemoryRepo([{ id: HID, household: household(), tasks: floorsTasks() }])
    const { eventsStore } = bindAll(repo, () => clock)
    useSessionStore().memberUid = ANA
    await eventsStore.complete('task-vacuum', { at: daysAgo(1), forUid: BEN })
    const completeId = eventsStore.recentlyLogged!.eventId
    await eventsStore.scheduleNext(completeId, 3)
    const router = await testRouter('/schedule')

    const wrapper = mount(ScheduleScreen, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('Recently done')
    const row = wrapper.get('.recent-done-row')
    expect(row.text()).toContain('Vacuum whole home')
    expect(row.get('[role="img"]').attributes('aria-label')).toBe('Ben')
    // due 3 days after a day-ago completion -> back in 2 days from now.
    expect(row.get('.recent-done-row__back').text()).toContain('back in 2 days')
  })
})

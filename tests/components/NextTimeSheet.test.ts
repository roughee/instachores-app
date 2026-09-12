// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NextTimeSheet from '@/components/NextTimeSheet.vue'
import { NOW, TZ, task } from '../helpers/fixtures'
import { DAY_MS } from '@/domain/time'

function mountSheet(overrides: Record<string, unknown> = {}) {
  return mount(NextTimeSheet, {
    props: {
      task: task({ name: 'Clean bathroom', category: 'bathroom', points: 0, freq: 'weekly', intervalDays: 7 }),
      completeEventId: 'ev-1',
      points: 16,
      memberName: 'Ana',
      completedAt: NOW,
      tz: TZ,
      categoryLabel: 'Bathroom',
      ...overrides,
    },
    attachTo: document.body,
  })
}

describe('NextTimeSheet', () => {
  it('preselects the task’s suggested interval', () => {
    const wrapper = mountSheet()
    const sevenDays = wrapper.findAll('[data-test="next-time-chip"]').find((c) => c.text() === '7 days')!
    expect(sevenDays.attributes('aria-pressed')).toBe('true')
    expect(sevenDays.classes()).toContain('next-time-sheet__chip--selected')
  })

  it('shows the header, the points and the last-done line', () => {
    const wrapper = mountSheet({ lastDoneAt: new Date(NOW.getTime() - 8 * DAY_MS) })
    expect(wrapper.text()).toContain('Clean bathroom logged')
    expect(wrapper.text()).toContain('+16 pts for Ana.')
    expect(wrapper.text()).toContain('Last done 8 days ago.')
  })

  it('drops the last-done sentence when the task was never done before', () => {
    const wrapper = mountSheet()
    expect(wrapper.text()).not.toContain('Last done')
  })

  it('opens with nothing preselected and a disabled primary button for an adhoc task with no interval', () => {
    const wrapper = mountSheet({ task: task({ name: 'Fix the shelf', freq: 'adhoc' }) })
    const chips = wrapper.findAll('[data-test="next-time-chip"]')
    for (const chip of chips) expect(chip.attributes('aria-pressed')).toBe('false')

    const primary = wrapper.get('[data-test="next-time-schedule"]')
    expect(primary.attributes('aria-disabled')).toBe('true')
  })

  it('selecting a chip enables the primary button and labels it with the due day', () => {
    const wrapper = mountSheet({ task: task({ name: 'Fix the shelf', freq: 'adhoc' }) })
    const threeDays = wrapper.findAll('[data-test="next-time-chip"]').find((c) => c.text() === '3 days')!
    threeDays.trigger('click')
    return wrapper.vm.$nextTick().then(() => {
      const primary = wrapper.get('[data-test="next-time-schedule"]')
      expect(primary.attributes('aria-disabled')).toBeUndefined()
      expect(primary.text()).toContain('Schedule for')
    })
  })

  it('emits schedule with the selected days when the primary button is tapped', async () => {
    const wrapper = mountSheet()
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')
    expect(wrapper.emitted('schedule')).toEqual([[7]])
  })

  it('does not emit schedule when the primary button is disabled', async () => {
    const wrapper = mountSheet({ task: task({ name: 'Fix the shelf', freq: 'adhoc' }) })
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')
    expect(wrapper.emitted('schedule')).toBeUndefined()
  })

  it('emits dismiss when Not now is tapped', async () => {
    const wrapper = mountSheet()
    await wrapper.get('[data-test="next-time-not-now"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toEqual([[]])
  })

  it('emits dismiss on Escape', async () => {
    const wrapper = mountSheet()
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('dismiss')).toEqual([[]])
  })

  it('emits dismiss on a scrim tap', async () => {
    const wrapper = mountSheet()
    await wrapper.get('[data-test="next-time-scrim"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toEqual([[]])
  })

  it('maps a picked date to whole days from the completion’s local day, minimum 1', async () => {
    const wrapper = mountSheet()
    const input = wrapper.get('input[type="date"]')
    await input.setValue('2026-09-20')
    // NOW is 2026-09-09 local; 2026-09-20 is 11 days later.
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')
    expect(wrapper.emitted('schedule')).toEqual([[11]])
  })

  it('a past picked date still maps to at least 1 day', async () => {
    const wrapper = mountSheet()
    const input = wrapper.get('input[type="date"]')
    await input.setValue('2020-01-01')
    await wrapper.get('[data-test="next-time-schedule"]').trigger('click')
    expect(wrapper.emitted('schedule')).toEqual([[1]])
  })

  it('has an accessible dialog role and label', () => {
    const wrapper = mountSheet()
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-label')).toBe('Schedule next time')
  })
})

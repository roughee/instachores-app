// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScheduleRow from '@/components/ScheduleRow.vue'

function props(overrides: Partial<InstanceType<typeof ScheduleRow>['$props']> = {}) {
  return {
    category: 'kitchen' as const,
    name: 'Cook dinner',
    points: 6,
    subline: '5 days ago · Ben',
    chipLabel: 'Due',
    chipVariant: 'due' as const,
    ...overrides,
  }
}

describe('ScheduleRow', () => {
  it('shows the task name, subline and points', () => {
    const wrapper = mount(ScheduleRow, { props: props() })
    expect(wrapper.text()).toContain('Cook dinner')
    expect(wrapper.text()).toContain('5 days ago · Ben')
    expect(wrapper.text()).toContain('6')
  })

  it('emits complete when tapped', async () => {
    const wrapper = mount(ScheduleRow, { props: props() })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('complete')).toHaveLength(1)
  })

  it('renders a due chip in the warn variant for the Today group', () => {
    const wrapper = mount(ScheduleRow, { props: props({ chipVariant: 'due', chipLabel: 'Due' }) })
    const chip = wrapper.get('.schedule-row__chip')
    expect(chip.text()).toBe('Due')
    expect(chip.classes()).toContain('schedule-row__chip--due')
  })

  it('renders a plain day chip for a task further out', () => {
    const wrapper = mount(ScheduleRow, { props: props({ chipVariant: 'day', chipLabel: 'Wed 16' }) })
    const chip = wrapper.get('.schedule-row__chip')
    expect(chip.text()).toBe('Wed 16')
    expect(chip.classes()).not.toContain('schedule-row__chip--due')
  })

  it('colors its icon tile from the task category', () => {
    const wrapper = mount(ScheduleRow, { props: props({ category: 'bathroom' }) })
    expect(wrapper.classes()).toContain('schedule-row--bathroom')
  })
})

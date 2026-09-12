// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RecentDoneRow from '@/components/RecentDoneRow.vue'

describe('RecentDoneRow', () => {
  it('shows the task name, member avatar and time label', () => {
    const wrapper = mount(RecentDoneRow, {
      props: {
        name: 'Fridge cleanout + wipe',
        memberName: 'Ana',
        memberColor: '#1f8a70',
        timeLabel: 'Yesterday, 19:40',
        backLabel: 'back in 13 days',
      },
    })
    expect(wrapper.text()).toContain('Fridge cleanout + wipe')
    expect(wrapper.text()).toContain('Yesterday, 19:40')
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Ana')
  })

  it('shows the back label with a calendar glyph', () => {
    const wrapper = mount(RecentDoneRow, {
      props: {
        name: 'Vacuum one room',
        memberName: 'Ben',
        memberColor: '#3f6fd4',
        timeLabel: 'Yesterday, 08:15',
        backLabel: 'back tomorrow',
      },
    })
    expect(wrapper.get('.recent-done-row__back').text()).toBe('back tomorrow')
  })
})

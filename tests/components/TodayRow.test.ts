// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayRow from '@/components/TodayRow.vue'
import type { TodayRow as TodayRowT } from '@/domain/today'

function row(overrides: Partial<TodayRowT> = {}): TodayRowT {
  return {
    eventId: 'ev-1',
    taskId: 'task-pots',
    taskName: 'Pots',
    category: 'kitchen',
    forUid: 'ana',
    points: 4,
    at: new Date('2026-09-09T18:00:00.000Z'),
    hourKey: '21',
    undone: false,
    ...overrides,
  }
}

describe('TodayRow', () => {
  it('shows the task name, points and time', () => {
    const wrapper = mount(TodayRow, {
      props: { row: row(), memberName: 'Ana', memberColor: '#1f8a70', timeLabel: '21:00' },
    })
    expect(wrapper.text()).toContain('Pots')
    expect(wrapper.text()).toContain('4')
    expect(wrapper.text()).toContain('21:00')
  })

  it('renders the member’s avatar', () => {
    const wrapper = mount(TodayRow, {
      props: { row: row(), memberName: 'Ana', memberColor: '#1f8a70', timeLabel: '21:00' },
    })
    expect(wrapper.findComponent({ name: 'MemberAvatar' }).exists()).toBe(true)
  })

  it('strikes through an undone row and excludes it visually from being an active total', () => {
    const wrapper = mount(TodayRow, {
      props: { row: row({ undone: true }), memberName: 'Ana', memberColor: '#1f8a70', timeLabel: '21:00' },
    })
    expect(wrapper.classes()).toContain('today-row--undone')
  })

  it('does not add the undone modifier for a live row', () => {
    const wrapper = mount(TodayRow, {
      props: { row: row(), memberName: 'Ana', memberColor: '#1f8a70', timeLabel: '21:00' },
    })
    expect(wrapper.classes()).not.toContain('today-row--undone')
  })
})

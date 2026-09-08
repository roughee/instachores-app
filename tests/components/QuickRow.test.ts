// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import QuickRow from '@/components/QuickRow.vue'
import { task } from '../helpers/fixtures'

describe('QuickRow', () => {
  it('emits complete with the tapped task’s id', async () => {
    const pots = task({ id: 'task-pots', name: 'Pots' })
    const counters = task({ id: 'task-counters', name: 'Counters' })
    const wrapper = mount(QuickRow, {
      props: { tasks: [pots, counters], doneTodayByTask: new Map() },
    })

    const buttons = wrapper.findAll('[data-test="task-button"]')
    expect(buttons).toHaveLength(2)
    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('complete')).toEqual([['task-counters']])
  })

  it('passes today’s doers through to each TaskButton', () => {
    const pots = task({ id: 'task-pots', name: 'Pots' })
    const ana = { uid: 'ana', name: 'Ana', color: '#1f8a70', role: 'adult' as const }
    const wrapper = mount(QuickRow, {
      props: { tasks: [pots], doneTodayByTask: new Map([['task-pots', [ana]]]) },
    })

    expect(wrapper.find('.task-button__avatar').text()).toBe('A')
  })
})

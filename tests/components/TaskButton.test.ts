// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskButton from '@/components/TaskButton.vue'
import { task } from '../helpers/fixtures'

describe('TaskButton', () => {
  it('shows the task name and its points', () => {
    const t = task({ name: 'Pots', points: 4 })
    const wrapper = mount(TaskButton, { props: { task: t, doneBy: [] } })
    expect(wrapper.text()).toContain('Pots')
    expect(wrapper.text()).toContain('4')
  })

  it('shows an avatar for each member who did it today', () => {
    const t = task({ name: 'Pots', points: 4 })
    const wrapper = mount(TaskButton, {
      props: { task: t, doneBy: [{ uid: 'ana', name: 'Ana', color: '#1f8a70', role: 'adult' as const }] },
    })
    expect(wrapper.find('.task-button__avatar').text()).toBe('A')
  })

  it('emits complete when tapped', async () => {
    const t = task({ name: 'Pots', points: 4 })
    const wrapper = mount(TaskButton, { props: { task: t, doneBy: [] } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('complete')).toHaveLength(1)
  })

  it('renders neither a subline nor a chip when neither prop is given', () => {
    const t = task({ name: 'Pots', points: 4 })
    const wrapper = mount(TaskButton, { props: { task: t, doneBy: [] } })
    expect(wrapper.find('.task-button__subline').exists()).toBe(false)
    expect(wrapper.find('.task-button__due').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('task-button--with-subline')
  })

  it('shows only the subline when due is not given', () => {
    const t = task({ name: 'Pots', points: 4 })
    const wrapper = mount(TaskButton, { props: { task: t, doneBy: [], subline: 'Last done 2 days ago by Ana' } })
    expect(wrapper.get('.task-button__subline').text()).toBe('Last done 2 days ago by Ana')
    expect(wrapper.find('.task-button__due').exists()).toBe(false)
    expect(wrapper.classes()).toContain('task-button--with-subline')
  })

  it('shows both the subline and the Due chip when both are given', () => {
    const t = task({ name: 'Pots', points: 4 })
    const wrapper = mount(TaskButton, {
      props: { task: t, doneBy: [], subline: 'Due today. Last done 5 days ago by Ben', due: 'Due' },
    })
    expect(wrapper.get('.task-button__subline').text()).toBe('Due today. Last done 5 days ago by Ben')
    expect(wrapper.get('.task-button__due').text()).toBe('Due')
  })
})

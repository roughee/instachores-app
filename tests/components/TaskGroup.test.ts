// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskGroup from '@/components/TaskGroup.vue'
import { task } from '../helpers/fixtures'

function bathroomFixture() {
  const parent = task({ id: 'task-bathroom', name: 'Clean bathroom', category: 'bathroom', points: 0, comboBonus: 2 })
  const toilet = task({ id: 'task-toilet', name: 'Toilet', category: 'bathroom', points: 4, parentId: parent.id })
  const sink = task({ id: 'task-sink', name: 'Sink', category: 'bathroom', points: 2, parentId: parent.id })
  const shower = task({ id: 'task-shower', name: 'Shower', category: 'bathroom', points: 4, parentId: parent.id })
  return { parent, toilet, sink, shower }
}

describe('TaskGroup', () => {
  it('emits complete with the tapped chip’s task id', async () => {
    const { parent, toilet, sink, shower } = bathroomFixture()
    const wrapper = mount(TaskGroup, {
      props: { parent, children: [toilet, sink, shower], doneTodayByTask: new Map() },
    })

    const chips = wrapper.findAll('[data-test="task-group-chip"]')
    expect(chips).toHaveLength(3)
    await chips[0]!.trigger('click')

    expect(wrapper.emitted('complete')).toEqual([[toilet.id]])
  })

  it('emits completeAll with every active child’s id when Do all is tapped', async () => {
    const { parent, toilet, sink, shower } = bathroomFixture()
    const wrapper = mount(TaskGroup, {
      props: { parent, children: [toilet, sink, shower], doneTodayByTask: new Map() },
    })

    await wrapper.get('[data-test="task-group-do-all"]').trigger('click')

    expect(wrapper.emitted('completeAll')).toEqual([[[toilet.id, sink.id, shower.id]]])
  })

  it('does not include an archived child in the chips or in Do all', async () => {
    const { parent, toilet, sink, shower } = bathroomFixture()
    const archivedShower = { ...shower, archived: true }
    const wrapper = mount(TaskGroup, {
      props: { parent, children: [toilet, sink, archivedShower], doneTodayByTask: new Map() },
    })

    expect(wrapper.findAll('[data-test="task-group-chip"]')).toHaveLength(2)
    await wrapper.get('[data-test="task-group-do-all"]').trigger('click')
    expect(wrapper.emitted('completeAll')).toEqual([[[toilet.id, sink.id]]])
  })

  it('shows no badge for one completion today', () => {
    const { parent, toilet, sink, shower } = bathroomFixture()
    const wrapper = mount(TaskGroup, {
      props: {
        parent,
        children: [toilet, sink, shower],
        doneTodayByTask: new Map([[toilet.id, ['ana']]]),
      },
    })

    expect(wrapper.find('.task-group__chip-badge').exists()).toBe(false)
  })

  it('shows a x2 badge once a chip has two completions today', () => {
    const { parent, toilet, sink, shower } = bathroomFixture()
    const wrapper = mount(TaskGroup, {
      props: {
        parent,
        children: [toilet, sink, shower],
        doneTodayByTask: new Map([[toilet.id, ['ana', 'ben']]]),
      },
    })

    expect(wrapper.get('.task-group__chip-badge').text()).toBe('x2')
  })
})

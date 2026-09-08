// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MemberSplit from '@/components/MemberSplit.vue'

const members = [
  { uid: 'ana', name: 'Ana' },
  { uid: 'ben', name: 'Ben' },
]

const byMember = {
  ana: { points: 12, count: 4 },
  ben: { points: 7, count: 2 },
}

const byCategory = {
  kitchen: { ana: 9, ben: 2 },
  laundry: { ana: 3, ben: 5 },
}

describe('MemberSplit', () => {
  it('shows each adult’s points and task count', () => {
    const wrapper = mount(MemberSplit, { props: { members, byMember, byCategory } })
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('4')
    expect(wrapper.text()).toContain('Ben')
    expect(wrapper.text()).toContain('7')
  })

  it('shows the top category per adult, by points in that category', () => {
    const wrapper = mount(MemberSplit, { props: { members, byMember, byCategory } })
    expect(wrapper.text()).toContain('Kitchen')
    expect(wrapper.text()).toContain('Laundry')
  })

  it('falls back gracefully when a member has no points yet', () => {
    const wrapper = mount(MemberSplit, {
      props: { members, byMember: {}, byCategory: {} },
    })
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('0')
  })
})

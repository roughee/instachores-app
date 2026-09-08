// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SplitBars from '@/components/SplitBars.vue'

const members = [
  { uid: 'ana', name: 'Ana' },
  { uid: 'ben', name: 'Ben' },
]

const byCategory = {
  kitchen: { ana: 5, ben: 3 },
  laundry: { ana: 0, ben: 4 },
}

describe('SplitBars', () => {
  it('renders one row per category with any points, each with a category label', () => {
    const wrapper = mount(SplitBars, { props: { members, byCategory } })
    expect(wrapper.text()).toContain('Kitchen')
    expect(wrapper.text()).toContain('Laundry')
  })

  it('renders a value label per bar, one per adult, never colour alone', () => {
    const wrapper = mount(SplitBars, { props: { members, byCategory } })
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Ben')
    // Values shown as text next to each bar.
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('4')
  })

  it('scales bar widths against the max value in the period', () => {
    const wrapper = mount(SplitBars, { props: { members, byCategory } })
    const fills = wrapper.findAll('.split-bars__fill')
    const widths = fills.map((f) => f.attributes('style'))
    expect(widths.some((s) => s?.includes('100%'))).toBe(true)
  })

  it('omits categories with no points at all', () => {
    const wrapper = mount(SplitBars, {
      props: { members, byCategory: { kitchen: { ana: 0, ben: 0 } } },
    })
    expect(wrapper.text()).not.toContain('Kitchen')
  })
})

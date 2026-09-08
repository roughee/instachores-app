// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HouseholdBar from '@/components/HouseholdBar.vue'

const members = [
  { uid: 'ana', name: 'Ana', color: '#1f8a70', role: 'adult' as const },
  { uid: 'ben', name: 'Ben', color: '#3f6fd4', role: 'adult' as const },
]

describe('HouseholdBar', () => {
  it('renders the household total against target in tabular numerals', () => {
    const wrapper = mount(HouseholdBar, {
      props: { household: 187, target: 250, byMember: {}, members },
    })
    expect(wrapper.text()).toContain('187 / 250')
  })

  it('does not show the member split until tapped', () => {
    const wrapper = mount(HouseholdBar, {
      props: {
        household: 90,
        target: 250,
        byMember: { ana: { points: 60, count: 5 }, ben: { points: 30, count: 3 } },
        members,
      },
    })
    expect(wrapper.text()).not.toContain('Ben')
  })

  it('expands into the member split on tap', async () => {
    const wrapper = mount(HouseholdBar, {
      props: {
        household: 90,
        target: 250,
        byMember: { ana: { points: 60, count: 5 }, ben: { points: 30, count: 3 } },
        members,
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Ben')
    expect(wrapper.text()).toContain('60')
    expect(wrapper.text()).toContain('30')
  })
})

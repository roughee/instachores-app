// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HourGroup from '@/components/HourGroup.vue'

describe('HourGroup', () => {
  it('renders the hour as a 24h clock heading', () => {
    const wrapper = mount(HourGroup, { props: { hourKey: '21' } })
    expect(wrapper.text()).toBe('21:00')
  })

  it('sets tabular figures so the digits line up down the list', () => {
    const wrapper = mount(HourGroup, { props: { hourKey: '09' } })
    expect(wrapper.classes()).toContain('tabular-nums')
  })
})

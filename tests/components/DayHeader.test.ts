// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DayHeader from '@/components/DayHeader.vue'

describe('DayHeader', () => {
  it('renders its label as a heading', () => {
    const wrapper = mount(DayHeader, { props: { label: 'Today' } })
    expect(wrapper.get('h2').text()).toBe('Today')
  })
})

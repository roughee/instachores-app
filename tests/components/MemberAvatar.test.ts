// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MemberAvatar from '@/components/MemberAvatar.vue'

describe('MemberAvatar', () => {
  it('renders the member’s first initial, uppercased', () => {
    const wrapper = mount(MemberAvatar, { props: { name: 'ben', color: '#3f6fd4' } })
    expect(wrapper.text()).toBe('B')
  })

  it('carries the member color as the background so members stay visually distinct', () => {
    const wrapper = mount(MemberAvatar, { props: { name: 'Ana', color: '#1f8a70' } })
    expect(wrapper.attributes('style')).toContain('background: #1f8a70')
  })

  it('names the member for assistive tech instead of leaving only a bare initial', () => {
    const wrapper = mount(MemberAvatar, { props: { name: 'Ana', color: '#1f8a70' } })
    expect(wrapper.attributes('aria-label')).toBe('Ana')
  })
})

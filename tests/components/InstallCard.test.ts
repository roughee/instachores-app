// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InstallCard from '@/components/InstallCard.vue'

describe('InstallCard', () => {
  it('shows the one-sentence pitch and both actions', () => {
    const wrapper = mount(InstallCard)
    expect(wrapper.text()).toContain('Add HomeCrew to your home screen')
    expect(wrapper.text()).toContain('Add')
    expect(wrapper.text()).toContain('Not now')
  })

  it('emits install when Add is clicked', async () => {
    const wrapper = mount(InstallCard)
    await wrapper.get('[data-test="install-card-add"]').trigger('click')
    expect(wrapper.emitted('install')).toHaveLength(1)
  })

  it('emits dismiss when Not now is clicked', async () => {
    const wrapper = mount(InstallCard)
    await wrapper.get('[data-test="install-card-dismiss"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})

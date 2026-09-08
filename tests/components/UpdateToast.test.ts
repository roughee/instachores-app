// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UpdateToast from '@/components/UpdateToast.vue'

describe('UpdateToast', () => {
  it('announces the update as a status region with the Reload copy', () => {
    const wrapper = mount(UpdateToast)
    const status = wrapper.get('[role="status"]')
    expect(status.text()).toContain('Update available')
    expect(status.text()).toContain('Reload')
  })

  it('emits reload when the action is clicked', async () => {
    const wrapper = mount(UpdateToast)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('reload')).toHaveLength(1)
  })
})

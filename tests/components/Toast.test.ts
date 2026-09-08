// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Toast from '@/components/Toast.vue'
import { configureSession } from '@/stores/sessionOptions'

let clock = new Date('2026-01-01T00:00:00.000Z')

beforeEach(() => {
  clock = new Date('2026-01-01T00:00:00.000Z')
  configureSession({ now: () => clock })
})

describe('Toast', () => {
  it('announces the message and action as a status region', () => {
    const wrapper = mount(Toast, {
      props: { message: 'Pots logged', actionLabel: 'Undo', expiresAt: clock.getTime() + 4000 },
    })
    const status = wrapper.get('[role="status"]')
    expect(status.text()).toContain('Pots logged')
    expect(status.text()).toContain('Undo')
  })

  it('has no action button when no actionLabel is given', () => {
    const wrapper = mount(Toast, { props: { message: 'Pots logged', expiresAt: clock.getTime() + 4000 } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('emits action when the action button is clicked', async () => {
    const wrapper = mount(Toast, {
      props: { message: 'Pots logged', actionLabel: 'Undo', expiresAt: clock.getTime() + 4000 },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('emits expire once the window (measured from the injected clock) elapses', () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(Toast, { props: { message: 'Pots logged', expiresAt: clock.getTime() + 4000 } })
      vi.advanceTimersByTime(3999)
      expect(wrapper.emitted('expire')).toBeUndefined()
      vi.advanceTimersByTime(1)
      expect(wrapper.emitted('expire')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

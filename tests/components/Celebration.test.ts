// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Celebration from '@/components/Celebration.vue'
import { useCelebration } from '@/composables/useCelebration'

const { celebration, trigger, clear } = useCelebration()

beforeEach(() => {
  clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Celebration', () => {
  it('renders the chosen icon and unmounts it after the animation ends', async () => {
    vi.useFakeTimers()
    trigger('var(--primary)')
    const id = celebration.value!.id

    const wrapper = mount(Celebration)
    expect(wrapper.find(`[data-test="celebration"].celebration__stage--${id}`).exists()).toBe(true)

    vi.advanceTimersByTime(900)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="celebration"]').exists()).toBe(false)
  })

  it('renders one icon element per icon in the chosen moment (five for sparkle-burst)', () => {
    trigger('var(--cat-kitchen)', () => 0.21) // deterministic index into the ten ids
    const wrapper = mount(Celebration)
    const id = celebration.value!.id
    const expectedCount = id === 'sparkle-burst' ? 5 : id === 'rocket' ? 3 : 1
    expect(wrapper.findAll('.celebration__icon')).toHaveLength(expectedCount)
  })

  it('colors the icon from the given token, never a literal', () => {
    trigger('var(--cat-laundry)')
    const wrapper = mount(Celebration)
    expect(wrapper.get('[data-test="celebration"]').attributes('style')).toContain('var(--cat-laundry)')
  })

  it('is empty when nothing was just logged', () => {
    const wrapper = mount(Celebration)
    expect(wrapper.find('[data-test="celebration"]').exists()).toBe(false)
  })

  it('clears its removal timer on unmount, so a stray callback never fires later', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    trigger('var(--primary)')

    const wrapper = mount(Celebration)
    wrapper.unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('under reduced motion the moment is skipped entirely: nothing renders', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({ matches: true, media: query }) as MediaQueryList) as typeof window.matchMedia
    try {
      trigger('var(--primary)')
      const wrapper = mount(Celebration)
      expect(wrapper.find('[data-test="celebration"]').exists()).toBe(false)
    } finally {
      window.matchMedia = original
    }
  })
})

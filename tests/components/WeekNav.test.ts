// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WeekNav from '@/components/WeekNav.vue'

const TZ = 'Europe/Vilnius'
// Monday 2026-09-07 00:00 Vilnius to Monday 2026-09-14 00:00 Vilnius.
const start = new Date('2026-09-06T21:00:00.000Z')
const end = new Date('2026-09-13T21:00:00.000Z')

describe('WeekNav', () => {
  it('labels the week from its start and end dates', () => {
    const wrapper = mount(WeekNav, { props: { start, end, tz: TZ, nextDisabled: false } })
    expect(wrapper.text()).toContain('7 to 13 Sep')
  })

  it('disables Next week at the current week (offset 0)', () => {
    const wrapper = mount(WeekNav, { props: { start, end, tz: TZ, nextDisabled: true } })
    const next = wrapper.get('[aria-label="Next week"]')
    expect(next.attributes('disabled')).toBeDefined()
  })

  it('enables Next week when not at the current week', () => {
    const wrapper = mount(WeekNav, { props: { start, end, tz: TZ, nextDisabled: false } })
    const next = wrapper.get('[aria-label="Next week"]')
    expect(next.attributes('disabled')).toBeUndefined()
  })

  it('emits prev and next on click', async () => {
    const wrapper = mount(WeekNav, { props: { start, end, tz: TZ, nextDisabled: false } })
    await wrapper.get('[aria-label="Previous week"]').trigger('click')
    await wrapper.get('[aria-label="Next week"]').trigger('click')
    expect(wrapper.emitted('prev')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
  })
})

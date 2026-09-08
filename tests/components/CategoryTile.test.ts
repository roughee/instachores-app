// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { PhCookingPot } from '@phosphor-icons/vue'
import CategoryTile from '@/components/CategoryTile.vue'

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/log', component: { template: '<div />' } },
      { path: '/log/:category', component: { template: '<div />' } },
    ],
  })
}

describe('CategoryTile', () => {
  it('shows the category icon, label and today’s count together (never color alone)', () => {
    const wrapper = mount(CategoryTile, {
      global: { plugins: [testRouter()] },
      props: { category: 'kitchen', label: 'Kitchen', icon: PhCookingPot, doneToday: 2, dueDot: false },
    })
    expect(wrapper.text()).toContain('Kitchen')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.findComponent(PhCookingPot).exists()).toBe(true)
  })

  it('hides the count badge when nothing is done today', () => {
    const wrapper = mount(CategoryTile, {
      global: { plugins: [testRouter()] },
      props: { category: 'kitchen', label: 'Kitchen', icon: PhCookingPot, doneToday: 0, dueDot: false },
    })
    expect(wrapper.find('.category-tile__count').exists()).toBe(false)
  })

  it('links to the category route', () => {
    const wrapper = mount(CategoryTile, {
      global: { plugins: [testRouter()] },
      props: { category: 'laundry', label: 'Laundry', icon: PhCookingPot, doneToday: 0, dueDot: false },
    })
    expect(wrapper.get('a').attributes('href')).toContain('/log/laundry')
  })
})

import { describe, expect, it } from 'vitest'
import { routes } from '@/router'

const expectedPaths = [
  '/welcome',
  '/log',
  '/log/:category',
  '/today',
  '/overview',
  '/rewards',
  '/kid',
  '/settings',
]

describe('router', () => {
  it.each(expectedPaths)('has a route for %s with a component', (path) => {
    const route = routes.find((r) => r.path === path)
    expect(route).toBeDefined()
    expect(route?.component).toBeTypeOf('function')
  })
})

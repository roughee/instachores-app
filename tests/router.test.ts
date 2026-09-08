import { describe, expect, it } from 'vitest'
import { resolveEntry, routes } from '@/router'

const expectedPaths = ['/welcome', '/log', '/log/:category', '/today', '/overview', '/rewards', '/kid', '/settings']

describe('router', () => {
  it.each(expectedPaths)('has a route for %s with a component', (path) => {
    const route = routes.find((r) => r.path === path)
    expect(route).toBeDefined()
    expect(route?.component).toBeTypeOf('function')
  })
})

/**
 * The entry guard as a pure function (issue #16, Architecture.md §7): given
 * the session's mode, whether `resume()` has settled, and where a navigation
 * is headed, decide whether it should really land somewhere else. Tested on
 * its own so the redirect logic never needs a real router or session store.
 */
describe('resolveEntry', () => {
  it('lets a navigation through while resume() has not settled yet', () => {
    expect(resolveEntry({ mode: 'disconnected', ready: false, to: '/log' })).toBeNull()
    expect(resolveEntry({ mode: 'disconnected', ready: false, to: '/welcome' })).toBeNull()
  })

  it('sends a disconnected, settled phone to Welcome from anywhere else', () => {
    expect(resolveEntry({ mode: 'disconnected', ready: true, to: '/log' })).toBe('/welcome')
    expect(resolveEntry({ mode: 'disconnected', ready: true, to: '/settings' })).toBe('/welcome')
  })

  it('lets a disconnected, settled phone stay on Welcome', () => {
    expect(resolveEntry({ mode: 'disconnected', ready: true, to: '/welcome' })).toBeNull()
  })

  it('sends a connected phone away from Welcome to Log', () => {
    expect(resolveEntry({ mode: 'sheets', ready: true, to: '/welcome' })).toBe('/log')
    expect(resolveEntry({ mode: 'demo', ready: true, to: '/welcome' })).toBe('/log')
  })

  it('leaves a connected phone alone everywhere else', () => {
    expect(resolveEntry({ mode: 'sheets', ready: true, to: '/log' })).toBeNull()
    expect(resolveEntry({ mode: 'demo', ready: true, to: '/today' })).toBeNull()
  })
})

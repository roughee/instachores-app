import { describe, expect, it } from 'vitest'
import { getSessionOptions } from '@/stores/session'

/**
 * Runs before any test calls `configureSession`, in a file of its own so
 * Vitest's per-file module isolation gives it the module's untouched
 * default state (a call in a shared file would see whatever the previous
 * test configured).
 */
describe('session options before configureSession is ever called', () => {
  it('defaults now() to the wall clock and ids() to a fresh id each call', () => {
    const opts = getSessionOptions()
    const before = Date.now()
    expect(opts.now().getTime()).toBeGreaterThanOrEqual(before)
    expect(opts.ids()).not.toBe(opts.ids())
  })

  it('storage/createSheetsRepo/createDemoRepo throw, naming the missing setup step', () => {
    const opts = getSessionOptions()
    expect(() => opts.storage.getItem('x')).toThrow(/configureSession/)
    expect(() => opts.createDemoRepo()).toThrow(/configureSession/)
    expect(() => opts.createSheetsRepo({ url: 'https://x/exec', secret: 'x'.repeat(12) })).toThrow(/configureSession/)
  })
})

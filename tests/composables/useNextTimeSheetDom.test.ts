// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { onDateInputChange, openDatePicker, useDragToDismiss } from '@/composables/useNextTimeSheetDom'

describe('openDatePicker', () => {
  it('does nothing for a null element', () => {
    expect(() => openDatePicker(null)).not.toThrow()
  })

  it('calls showPicker when the element has one', () => {
    const el = document.createElement('input')
    const showPicker = vi.fn()
    Object.assign(el, { showPicker })
    openDatePicker(el)
    expect(showPicker).toHaveBeenCalledTimes(1)
  })

  it('falls back to click when showPicker is unavailable', () => {
    const el = document.createElement('input')
    const click = vi.spyOn(el, 'click')
    openDatePicker(el)
    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('onDateInputChange', () => {
  it('calls onValue with the input value for a real input target', () => {
    const onValue = vi.fn()
    const handler = onDateInputChange(onValue)
    const el = document.createElement('input')
    el.value = '2026-09-20'
    handler({ target: el } as unknown as Event)
    expect(onValue).toHaveBeenCalledWith('2026-09-20')
  })

  it('does not call onValue for an empty value', () => {
    const onValue = vi.fn()
    const handler = onDateInputChange(onValue)
    const el = document.createElement('input')
    handler({ target: el } as unknown as Event)
    expect(onValue).not.toHaveBeenCalled()
  })

  it('does not call onValue when the target is not an input', () => {
    const onValue = vi.fn()
    const handler = onDateInputChange(onValue)
    handler({ target: document.createElement('div') } as unknown as Event)
    expect(onValue).not.toHaveBeenCalled()
  })
})

describe('useDragToDismiss', () => {
  function fakePointerEvent(clientY: number, currentTarget: unknown = null) {
    return { clientY, currentTarget, pointerId: 1 } as unknown as PointerEvent
  }

  it('captures the pointer and records the start position on pointerdown', () => {
    const onDismiss = vi.fn()
    const { onPointerDown } = useDragToDismiss(onDismiss)
    const el = document.createElement('div')
    const setPointerCapture = vi.fn()
    Object.assign(el, { setPointerCapture })
    onPointerDown(fakePointerEvent(0, el))
    expect(setPointerCapture).toHaveBeenCalledWith(1)
  })

  it('does not throw when currentTarget is not an element', () => {
    const { onPointerDown } = useDragToDismiss(vi.fn())
    expect(() => onPointerDown(fakePointerEvent(0, null))).not.toThrow()
  })

  it('does not dismiss for a small movement', () => {
    const onDismiss = vi.fn()
    const { onPointerDown, onPointerMove } = useDragToDismiss(onDismiss)
    onPointerDown(fakePointerEvent(0))
    onPointerMove(fakePointerEvent(20))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses once the drag passes the threshold', () => {
    const onDismiss = vi.fn()
    const { onPointerDown, onPointerMove } = useDragToDismiss(onDismiss)
    onPointerDown(fakePointerEvent(0))
    onPointerMove(fakePointerEvent(50))
    expect(onDismiss).toHaveBeenCalledTimes(1)

    // A further move past the threshold does not fire it again.
    onPointerMove(fakePointerEvent(80))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('a move before any pointerdown is a no-op', () => {
    const onDismiss = vi.fn()
    const { onPointerMove } = useDragToDismiss(onDismiss)
    onPointerMove(fakePointerEvent(100))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('pointerup resets the drag so a later move does not dismiss', () => {
    const onDismiss = vi.fn()
    const { onPointerDown, onPointerMove, onPointerUp } = useDragToDismiss(onDismiss)
    onPointerDown(fakePointerEvent(0))
    onPointerUp()
    onPointerMove(fakePointerEvent(50))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})

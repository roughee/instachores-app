/**
 * DOM-typed bits for `NextTimeSheet.vue` (DESIGN.md §5, issue #69): kept in
 * a `.ts` file because eslint only resolves DOM globals -- `HTMLElement`,
 * `HTMLInputElement`, `PointerEvent`, `Event`, both as values and as types
 * -- outside `.vue` files (same reasoning as `useFocusReturn.ts`; `Toast`'s
 * `useAutoExpire` and `usePwa.ts`'s `hasFlag` are the same pattern for
 * plain browser globals). Every export here returns something the
 * component can bind or call without writing a DOM type name itself.
 */
import { ref } from 'vue'
import type { Ref } from 'vue'

export function useElementRef(): Ref<HTMLElement | null> {
  return ref<HTMLElement | null>(null)
}

export function useInputRef(): Ref<HTMLInputElement | null> {
  return ref<HTMLInputElement | null>(null)
}

/** Opens a native `<input type="date">`'s picker, falling back to a plain
 * `click` for browsers -- and test environments -- without `showPicker`. */
export function openDatePicker(el: HTMLInputElement | null): void {
  if (!el) return
  if ('showPicker' in el && typeof el.showPicker === 'function') el.showPicker()
  else el.click()
}

/**
 * A `change` handler factory for the date input: reads the picked value and
 * hands it to `onValue` as a plain string, or not at all for an empty
 * value. The component never sees `Event`/`HTMLInputElement` this way.
 */
export function onDateInputChange(onValue: (value: string) => void): (event: Event) => void {
  return (event: Event) => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.value) onValue(target.value)
  }
}

/** Pointer handlers for "drag the sheet handle down more than `thresholdPx`
 * to dismiss" (DESIGN.md §5 NextTimeSheet: "a simple pointer swipe of more
 * than 40px is enough"). */
export function useDragToDismiss(onDismiss: () => void, thresholdPx = 40) {
  let startY: number | undefined

  function onPointerDown(event: PointerEvent): void {
    startY = event.clientY
    const el = event.currentTarget
    if (el instanceof HTMLElement) el.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent): void {
    if (startY === undefined) return
    if (event.clientY - startY > thresholdPx) {
      startY = undefined
      onDismiss()
    }
  }

  function onPointerUp(): void {
    startY = undefined
  }

  return { onPointerDown, onPointerMove, onPointerUp }
}

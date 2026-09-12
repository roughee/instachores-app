/**
 * Two tiny DOM reads/writes for `NextTimeSheet.vue` (DESIGN.md §5, issue
 * #69): "focus moves into the sheet on open and back on close." `document`
 * is a browser global eslint only allows outside `.vue` files (same
 * reasoning as `useToast.ts`'s `useAutoExpire`, `usePwa.ts`'s `hasFlag`), so
 * this is the one place that reaches for `document.activeElement` instead
 * of the component doing it directly.
 */
export function captureFocusedElement(): HTMLElement | null {
  const active = document.activeElement
  return active instanceof HTMLElement ? active : null
}

export function returnFocusTo(el: HTMLElement | null): void {
  el?.focus()
}

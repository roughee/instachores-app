/**
 * A short haptic tick on a completed tap (DESIGN.md §5 TaskButton). Guarded:
 * most desktop browsers, and Vitest's happy-dom, have no `navigator.vibrate`.
 */
export function useHaptic() {
  function tick(): void {
    navigator.vibrate?.([10])
  }

  return { tick }
}

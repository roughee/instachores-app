/**
 * One toast at a time (DESIGN.md §5 Toast, Plan §5.4): `show` replaces
 * whatever is showing rather than queueing it, so the owner never has to
 * manage a queue itself. `expiresAt` is stamped from the injected clock
 * (`sessionOptions.now`), the same source `eventsStore.complete` uses for
 * its undo window, so a test can control both deterministically.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getSessionOptions } from '@/stores/sessionOptions'

export const TOAST_DURATION_MS = 4000

export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastState {
  message: string
  action?: ToastAction | undefined
  expiresAt: number
}

export interface ShowToastOptions {
  message: string
  action?: ToastAction | undefined
}

export function useToast() {
  const toast = ref<ToastState | undefined>(undefined)

  /** Replaces the current toast, if any (queue of one). */
  function show(opts: ShowToastOptions): void {
    const now = getSessionOptions().now()
    toast.value = { message: opts.message, action: opts.action, expiresAt: now.getTime() + TOAST_DURATION_MS }
  }

  function dismiss(): void {
    toast.value = undefined
  }

  return { toast, show, dismiss }
}

/**
 * Fires `onExpire` once `expiresAt()` (measured against the injected clock)
 * elapses. Pulled out of `Toast.vue` so the component itself never touches
 * `setTimeout`/`clearTimeout` directly: eslint's browser-global rules apply
 * per file, and `.ts` files (unlike `.vue` ones) already carry them via
 * `typescript-eslint`'s config.
 */
export function useAutoExpire(expiresAt: () => number, onExpire: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined

  onMounted(() => {
    const now = getSessionOptions().now()
    const delay = Math.max(0, expiresAt() - now.getTime())
    timer = setTimeout(onExpire, delay)
  })

  onBeforeUnmount(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

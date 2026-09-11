/**
 * Celebration overlay state (issue #53, DESIGN.md §4 motion): a shared ref
 * so a single `Celebration.vue`, mounted once in `App.vue`, can react to a
 * log made from `LogScreen` or `CategoryScreen` without either screen
 * importing the other or the overlay component itself. `pickCelebration`
 * is the pure part -- it never returns `previous` when there is more than
 * one option, so two quick taps in a row rarely show the same moment
 * twice. `trigger()` is synchronous: it never delays the toast, the
 * haptic tick, or the optimistic apply that already happened next to it.
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export const CELEBRATION_IDS = [
  'smile-pop',
  'wink',
  'sparkle-burst',
  'rocket',
  'tree-grow',
  'flower-open',
  'cat-stretch',
  'dog-wag',
  'bird-takeoff',
  'star-catch',
] as const

export type CelebrationId = (typeof CELEBRATION_IDS)[number]

export interface CelebrationView {
  id: CelebrationId
  /** A CSS color value, e.g. `var(--cat-kitchen)` -- never a hex literal. */
  color: string
}

/**
 * Picks one of the ten ids at random, never `previous` (unless it is the
 * only option there is). `random` is injected so this stays a pure
 * function: pass `Math.random` for real use, a fixed sequence in tests.
 */
export function pickCelebration(previous: CelebrationId | undefined, random: () => number): CelebrationId {
  const options = previous === undefined ? CELEBRATION_IDS : CELEBRATION_IDS.filter((id) => id !== previous)
  const index = Math.min(options.length - 1, Math.floor(random() * options.length))
  return options[index]!
}

export interface CelebrationState {
  celebration: Ref<CelebrationView | undefined>
  trigger: (color: string, random?: () => number) => void
  clear: () => void
  /** Dev-only: sets a specific id directly, bypassing the random pick.
   * `App.vue`'s `?forceCelebration=<id>` flag uses this so
   * `scripts/screenshots.mjs` can capture each of the ten deterministically
   * (same pattern as `usePwa.ts`'s `forceUpdateToast`/`forceInstallCard`). */
  triggerExact: (id: CelebrationId, color: string) => void
}

/** Builds an independent celebration state; used by `useCelebration`'s
 * shared singleton below and directly by tests that want an isolated
 * instance instead of the app-wide one. */
export function createCelebrationState(): CelebrationState {
  const celebration = ref<CelebrationView | undefined>(undefined)
  let previousId: CelebrationId | undefined

  function trigger(color: string, random: () => number = Math.random): void {
    previousId = pickCelebration(previousId, random)
    celebration.value = { id: previousId, color }
  }

  function triggerExact(id: CelebrationId, color: string): void {
    previousId = id
    celebration.value = { id, color }
  }

  function clear(): void {
    celebration.value = undefined
  }

  return { celebration, trigger, clear, triggerExact }
}

const shared = createCelebrationState()

/** Always returns the same shared instance, so `App.vue`'s `Celebration`
 * and every screen that calls `trigger()` see one state. */
export function useCelebration(): CelebrationState {
  return shared
}

/** Issue #53's one-shot removal timer, ~900ms after a trigger. */
const CELEBRATION_DURATION_MS = 900

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * `Celebration.vue`'s own logic, pulled out so the component's `<script>`
 * never touches `window`/`setTimeout` directly (same reasoning as
 * `useAutoExpire` in `useToast.ts`: eslint's browser globals apply per
 * `.ts` file, `.vue` files do not carry them). Watches the shared
 * `celebration` ref and, for each new value: under
 * `prefers-reduced-motion: reduce`, clears it right away so the moment is
 * skipped entirely rather than fading (see `Celebration.vue`'s header
 * comment for why); otherwise starts the ~900ms removal timer.
 */
export function useCelebrationOverlay(): {
  celebration: Ref<CelebrationView | undefined>
  reducedMotion: Ref<boolean>
} {
  const { celebration, clear } = useCelebration()
  const reducedMotion = ref(prefersReducedMotion())
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(
    () => celebration.value,
    (next) => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      if (!next) return
      reducedMotion.value = prefersReducedMotion()
      if (reducedMotion.value) {
        clear()
        return
      }
      timer = setTimeout(clear, CELEBRATION_DURATION_MS)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (timer !== undefined) clearTimeout(timer)
  })

  return { celebration, reducedMotion }
}

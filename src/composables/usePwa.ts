/**
 * PWA install and update plumbing (Plan §6.10, Architecture.md §9). Wraps
 * vite-plugin-pwa's Vue registration helper: `registerType: 'prompt'` means
 * the new service worker waits until `reload()` (from UpdateToast) calls
 * `updateServiceWorker(true)` -- auto-swapping mid-tap is how an event gets
 * lost. `beforeinstallprompt` is captured so Settings can offer InstallCard.
 *
 * `installCardVisible` and `isStandaloneDisplay` are pure functions of
 * plain booleans, unit-tested in Node/happy-dom without touching a real
 * browser install flow. Two query flags, `forceUpdateToast` and
 * `forceInstallCard`, force each state on so scripts/screenshots.mjs can
 * render both deterministically (dev-only; harmless in production since
 * nobody links to the app with those params).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { readPrefs, writePrefs } from './useTheme'

export interface InstallCardState {
  standalone: boolean
  canInstall: boolean
  dismissed: boolean
}

export function installCardVisible(state: InstallCardState): boolean {
  return !state.standalone && state.canInstall && !state.dismissed
}

export function isStandaloneDisplay(nav: { standalone?: boolean }, displayModeQuery: { matches: boolean }): boolean {
  return displayModeQuery.matches || nav.standalone === true
}

/** The subset of `BeforeInstallPromptEvent` this composable needs; that
 * type is not in lib.dom.d.ts, so it is declared locally. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Reads a boolean query flag off the current URL. Exported so other
 * dev-only, screenshot-forcing flags (WelcomeScreen's `forceLinkError`) can
 * share the same check rather than re-reading `window.location` themselves. */
export function hasFlag(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) !== null
}

/**
 * Dev-only `?pollMs=` override for `SheetsRepo`'s poll interval (issue #22
 * e2e smoke), read by `main.ts` when building the repo: lets the two-context
 * sync test see a partner's event within one short poll instead of the real
 * 30s cadence, the same query-flag pattern as `hasFlag` above. Harmless in
 * production since nobody links to the app with this param. `undefined` for
 * a missing, non-numeric or non-positive value, so the caller falls back to
 * `SheetsRepo`'s own default.
 */
export function readPollIntervalMs(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('pollMs')
  if (raw === null) return undefined
  const ms = Number(raw)
  return Number.isFinite(ms) && ms > 0 ? ms : undefined
}

/** Reads a query flag's value off the current URL, or `null` if absent
 * (issue #20's `?demoComplete=<taskId>,<taskId>`): the .vue files keep
 * `window`/`URLSearchParams` out of their own `<script>` blocks (only `.ts`
 * files carry eslint's browser globals), so this is the one place a screen
 * reaches for a flag's value instead of `hasFlag`'s plain boolean. */
export function flagValue(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

export function usePwa() {
  const { needRefresh: swNeedRefresh, updateServiceWorker } = useRegisterSW({ immediate: true })
  const forceUpdateToast = hasFlag('forceUpdateToast')
  const forceInstallCard = hasFlag('forceInstallCard')

  const needRefresh = computed(() => forceUpdateToast || swNeedRefresh.value)

  const canInstall = ref(forceInstallCard)
  const standalone = ref(
    isStandaloneDisplay(
      navigator as Navigator & { standalone?: boolean },
      window.matchMedia('(display-mode: standalone)'),
    ),
  )
  const prefs = ref(readPrefs(localStorage))
  let deferredPrompt: BeforeInstallPromptEvent | null = null

  function onBeforeInstallPrompt(event: Event): void {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    canInstall.value = true
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  })

  async function install(): Promise<void> {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    canInstall.value = false
  }

  function dismissInstallCard(): void {
    prefs.value = { ...prefs.value, installCardDismissed: true }
    writePrefs(localStorage, prefs.value)
  }

  async function reload(): Promise<void> {
    await updateServiceWorker(true)
  }

  const showInstallCard = computed(() =>
    installCardVisible({
      standalone: standalone.value,
      canInstall: canInstall.value,
      dismissed: prefs.value.installCardDismissed ?? false,
    }),
  )

  return { needRefresh, reload, canInstall, install, showInstallCard, dismissInstallCard }
}

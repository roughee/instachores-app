/**
 * Theme preference: system / light / dark, stored through the Zod-validated
 * `Prefs` schema in localStorage. `readPrefs` and `applyTheme` are pure and
 * take their storage / root as arguments so they run in plain Node under
 * Vitest with no DOM. `useTheme` wires them to the real `localStorage` and
 * `document.documentElement` for use inside components.
 *
 * The same read-and-apply logic runs a second time, inline, in index.html
 * before the bundle loads, so the correct theme is set before first paint.
 */
import { ref } from 'vue'
import { Prefs, defaultPrefs, type Theme } from '@/schemas/prefs'

export const PREFS_STORAGE_KEY = 'homecrew.prefs'

/** The subset of the `Storage` interface these helpers need. */
export interface PrefsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The subset of an element `useTheme` needs to toggle `data-theme`. */
export interface ThemeRoot {
  dataset: { theme?: string }
}

/** Reads and validates stored prefs. Any missing key, bad JSON, or schema
 * rejection falls back to `defaultPrefs` (theme: 'system') rather than
 * throwing, so a corrupt value never blocks the app from rendering. */
export function readPrefs(storage: PrefsStorage): Prefs {
  try {
    const raw = storage.getItem(PREFS_STORAGE_KEY)
    if (raw === null) return defaultPrefs
    const result = Prefs.safeParse(JSON.parse(raw))
    return result.success ? result.data : defaultPrefs
  } catch {
    return defaultPrefs
  }
}

export function writePrefs(storage: PrefsStorage, prefs: Prefs): void {
  storage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
}

/** `system` removes the `data-theme` attribute so the `prefers-color-scheme`
 * media query in tokens.css takes over; `light` / `dark` force it. */
export function applyTheme(theme: Theme, root: ThemeRoot): void {
  if (theme === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = theme
  }
}

export function useTheme() {
  const prefs = ref<Prefs>(readPrefs(localStorage))
  applyTheme(prefs.value.theme, document.documentElement)

  function setTheme(theme: Theme): void {
    prefs.value = { ...prefs.value, theme }
    writePrefs(localStorage, prefs.value)
    applyTheme(theme, document.documentElement)
  }

  return { prefs, setTheme }
}

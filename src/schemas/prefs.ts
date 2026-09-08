import { z } from 'zod'

/**
 * Device-local UI preferences, persisted through `useTheme` (localStorage,
 * never synced to the household sheet). Kept intentionally small: a version
 * tag for future migrations, the theme override, and the last tab visited.
 */
export const Theme = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof Theme>

export const Prefs = z.object({
  v: z.literal(1).default(1),
  theme: Theme.default('system'),
  lastTab: z.string().min(1).optional(),
  /** Set once the user dismisses the "Add to home screen" card (Plan §6.10)
   * so it never reappears on this device, even after a fresh install prompt. */
  installCardDismissed: z.boolean().optional(),
})
export type Prefs = z.infer<typeof Prefs>

export const defaultPrefs: Prefs = Prefs.parse({})

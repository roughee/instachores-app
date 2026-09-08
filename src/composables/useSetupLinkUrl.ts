/**
 * The shareable setup-link URL for whatever `getLink()` returns right now,
 * plus a copy-to-clipboard action (issue #21, Plan §5.5 Settings). Kept in
 * its own composable, not the Settings screen's script block, so it is the
 * one place that touches `window.location`/`navigator.clipboard` directly
 * (the same split useTheme.ts and usePwa.ts use: browser globals live in
 * composables, screens stay declarative).
 */
import { computed } from 'vue'
import { buildSetupLinkUrl } from '@/schemas'
import type { SetupLink as SetupLinkT } from '@/schemas'

export function useSetupLinkUrl(getLink: () => SetupLinkT | null) {
  const url = computed<string | undefined>(() => {
    const link = getLink()
    if (!link) return undefined
    return buildSetupLinkUrl(link, window.location.origin, window.location.pathname)
  })

  /** No-op when there is nothing to copy yet. */
  async function copy(): Promise<void> {
    if (!url.value) return
    await navigator.clipboard.writeText(url.value)
  }

  return { url, copy }
}

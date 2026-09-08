// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetupLinkUrl } from '@/composables/useSetupLinkUrl'
import { encodeSetupLink } from '@/schemas'
import type { SetupLink as SetupLinkT } from '@/schemas'

const LINK: SetupLinkT = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'x'.repeat(12) }

function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const clipboard = { writeText: vi.fn(async () => undefined) }
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  return clipboard
}

beforeEach(() => {
  window.history.replaceState({}, '', '/instachores-app/')
})

describe('useSetupLinkUrl', () => {
  it('is undefined when there is no link', () => {
    const { url } = useSetupLinkUrl(() => null)
    expect(url.value).toBeUndefined()
  })

  it('builds the welcome URL from the current page location and the given link', () => {
    const { url } = useSetupLinkUrl(() => LINK)
    expect(url.value).toBe(`${window.location.origin}/instachores-app/#/welcome?s=${encodeSetupLink(LINK)}`)
  })

  it('copy() writes the built URL to the clipboard', async () => {
    const clipboard = stubClipboard()
    const { copy } = useSetupLinkUrl(() => LINK)

    await copy()

    expect(clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/instachores-app/#/welcome?s=${encodeSetupLink(LINK)}`,
    )
  })

  it('copy() is a no-op when there is no link', async () => {
    const clipboard = stubClipboard()
    const { copy } = useSetupLinkUrl(() => null)

    await copy()

    expect(clipboard.writeText).not.toHaveBeenCalled()
  })
})

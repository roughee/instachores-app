import { z } from 'zod'

/**
 * What one phone shares with the other: where the Apps Script lives and the
 * household secret. Travels as a base64url string in the welcome URL hash and
 * is stored on the device, never in the repo or the bundle.
 */
export const SetupLink = z.object({
  url: z.url().startsWith('https://'),
  secret: z.string().min(12).max(128),
})
export type SetupLink = z.infer<typeof SetupLink>

const B64URL = /^[A-Za-z0-9_-]+$/

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  if (!B64URL.test(s)) throw new Error('setup link is not base64url')
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Encodes without validating, so a bad link is caught on decode by whoever receives it. */
export function encodeSetupLink(link: SetupLink): string {
  return toBase64Url(JSON.stringify(link))
}

/** Throws (ZodError or Error) on anything that is not a valid link. */
export function decodeSetupLink(encoded: string): SetupLink {
  return SetupLink.parse(JSON.parse(fromBase64Url(encoded)))
}

/**
 * Rebuilds the shareable setup-link URL for `link` (issue #21, Plan §5.5
 * Settings, Architecture.md §7: `https://<host>/<path>/#/welcome?s=<token>`).
 * `origin` and `pathname` are passed in rather than read from `location`
 * directly, so this stays pure and works the same on GitHub Pages, a PR
 * preview subfolder, and local dev.
 */
export function buildSetupLinkUrl(link: SetupLink, origin: string, pathname: string): string {
  return `${origin}${pathname}#/welcome?s=${encodeSetupLink(link)}`
}

/**
 * Pulls the `s=` token out of a pasted full setup-link URL (issue #16,
 * Architecture.md §7: `https://<user>.github.io/homecrew/#/welcome?s=<token>`).
 * A bare token -- what the Welcome screen's field is pre-filled with when the
 * link itself was opened -- passes through unchanged, trimmed. Never throws;
 * a URL with no `s` param falls back to the trimmed input, which then fails
 * `decodeSetupLink` the same way any other malformed link would.
 */
export function extractSetupLinkToken(raw: string): string {
  const trimmed = raw.trim()
  const afterHash = trimmed.includes('#') ? trimmed.slice(trimmed.indexOf('#') + 1) : trimmed
  const queryIndex = afterHash.indexOf('?')
  if (queryIndex >= 0) {
    const token = new URLSearchParams(afterHash.slice(queryIndex + 1)).get('s')
    if (token) return token
  }
  return trimmed
}

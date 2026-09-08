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

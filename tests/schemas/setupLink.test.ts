import { describe, expect, it } from 'vitest'
import { decodeSetupLink, encodeSetupLink, extractSetupLinkToken } from '@/schemas/setupLink'
import type { SetupLink } from '@/schemas/setupLink'

describe('extractSetupLinkToken', () => {
  it('passes a bare token through unchanged (a pre-filled ?s= field re-submitted as-is)', () => {
    expect(extractSetupLinkToken('abc123')).toBe('abc123')
  })

  it('trims surrounding whitespace off a bare token', () => {
    expect(extractSetupLinkToken('  abc123  ')).toBe('abc123')
  })

  it('pulls the s= value out of a full pasted setup-link URL', () => {
    const url = 'https://roughee.github.io/instachores-app/#/welcome?s=abc123'
    expect(extractSetupLinkToken(url)).toBe('abc123')
  })

  it('decodes a URL-encoded token from the query string', () => {
    const url = 'https://roughee.github.io/instachores-app/#/welcome?s=abc%2Bxyz'
    expect(extractSetupLinkToken(url)).toBe('abc+xyz')
  })

  it('falls back to the trimmed input when there is a query but no s param', () => {
    const url = 'https://roughee.github.io/instachores-app/#/welcome?other=1'
    expect(extractSetupLinkToken(url)).toBe(url)
  })

  it('round-trips with encodeSetupLink/decodeSetupLink through a full pasted URL', () => {
    const link: SetupLink = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'x'.repeat(12) }
    const token = encodeSetupLink(link)
    const pastedUrl = `https://roughee.github.io/instachores-app/#/welcome?s=${token}`
    expect(decodeSetupLink(extractSetupLinkToken(pastedUrl))).toEqual(link)
  })
})
